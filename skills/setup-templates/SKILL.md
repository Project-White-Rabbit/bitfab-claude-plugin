---
name: setup-templates
description: Templates phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_trace_functions", "mcp__plugin_bitfab_Bitfab__search_traces", "mcp__plugin_bitfab_Bitfab__get_template_reference", "mcp__plugin_bitfab_Bitfab__get_template", "mcp__plugin_bitfab_Bitfab__update_template", "Skill"]
---

# Bitfab Setup: Templates

**Run only when mode is `templates`.**

Iterate on the **span-rendering templates** for one trace function. Each round: the user describes what should look different, you call `mcp__plugin_bitfab_Bitfab__get_template` → edit → `mcp__plugin_bitfab_Bitfab__update_template` **with `traceFunctionKey` set to the picked key**, and the change renders live against a real trace. That live surface is either the trace view the user already has open (inline mode: every trace view subscribes to `template:updated`, so it re-renders on save without any refresh) or a dedicated chromeless preview page you open for them: step 5 picks between them so the user is never yanked off a trace they're already viewing. Loop until the user is satisfied. Triggered explicitly by `/bitfab:setup templates [<key>]`, never reached from `wizard`.

Templates control how a span's input / output renders in the Bitfab UI. They are scoped per **span type** (`llm`, `agent`, `function`, `guardrail`, `handoff`, `custom`). This phase **always passes `traceFunctionKey`** so edits become **per-function overrides**: they apply only to spans on traces of the picked function, not to other functions in the org. Resolution at render time is per-key row → org-global → file default, so the seed you see in `mcp__plugin_bitfab_Bitfab__get_template` reflects whatever is currently rendering for this function. Surface this scope when the user asks for a change so they know nothing else in the org is affected.

1. If the user passed a key as the argument, use it directly and continue.

   Otherwise, follow the same picker pattern as `/bitfab:assistant`:

   1. Call `mcp__plugin_bitfab_Bitfab__list_trace_functions` to enumerate the org's traced functions. The tool returns flat `FUNCTION: <key>` lines; work from those keys directly. Use **only** the keys returned: do NOT invent or infer descriptions of what each function does from its name. Key names are often ambiguous, and guessing produces hallucinated summaries that confuse the user.
   2. Grep this repo for each key in parallel (across `*.ts`, `*.tsx`, `*.py`, `*.rb`, `*.go`, `*.baml`) so you know which keys are instrumented here. Mark each as ✅ instrumented here (with file path) or ⚠️ not found in this repo.
   3. Present a compact list in the question text showing only: `<key>` · `<repo marker + path>`. No invented summaries.
   4. Use `AskUserQuestion` with 2 options: the recommended function (prefer ✅ instrumented here, and matching session context when one is clearly relevant) and a free-text "Type a function key" option. If nothing is instrumented in this repo, say so explicitly in the question, don't hide it.

   - **argument supplied**: use it as the trace function key and continue → step 2
   - **no argument**: list trace functions, ask the user, then continue with the chosen key → step 2
2. Call `mcp__plugin_bitfab_Bitfab__get_template_reference` **once** before any edit. It returns a stable agent-facing schema for Bitfab span templates: the rendering engine (Nunjucks, Jinja2-compatible), the render-context shape (top-level keys, `SpanData` / `ParsedSpanData`), the registered custom filters and tests, common patterns from the live default templates, and error-fallback behavior. Without this you cannot write a correct edit; references to undeclared variables silently render empty in production.

   Hold the reference in your working context for the rest of the loop. Do NOT call it again on subsequent edits.
3. Before opening the preview, grep the codebase for the trace function key (`<key>`) so you can see what the function actually does. The user's "change" requests are usually about surfacing something domain-specific (an input field, a tool name, a context label), and knowing the function helps you map the request to the right span type and the right field path. If grep returns nothing (the function has been renamed or the user is operating on traces from a different repo), continue without it.
4. The preview page renders the most recent trace for the function. Without at least one trace it has nothing to render, so check before opening it.

   Call `mcp__plugin_bitfab_Bitfab__search_traces` with `{ traceFunctionKey: "<key>", limit: 1 }`. If the response contains a trace ID, continue. If the response indicates no traces exist (e.g. `No traces found matching the filter criteria.`), exit and tell the user in one short line: `No traces yet for <key>. Run your app (or the replay script) to generate one, then re-run \`/bitfab:setup templates <key>\` to preview.` Do NOT block waiting; the user re-invokes when they have a trace.

   - **trace exists**: continue and choose the preview mode → step 5
   - **no traces yet for this function**: exit and tell the user to generate a trace and re-run → the `setup-cleanup` skill

   **Next:**

   - No traces yet for this function (mode `templates`): invoke the `setup-cleanup` skill with mode `templates`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
5. The edit itself is just `mcp__plugin_bitfab_Bitfab__get_template` → `mcp__plugin_bitfab_Bitfab__update_template`; the only open question is where the user watches the result. **The normal Studio trace view already re-renders on every save** (it subscribes to the same `template:updated` event the preview page does), so if the user is already looking at a trace of `<key>`, you do NOT need to open anything: editing in place keeps their current view and avoids yanking them onto a different page.

   Use `AskUserQuestion` with two options. **Recommend inline whenever the context shows the user is already viewing a trace of this function** (e.g. they asked to change templates *while looking at a trace*): that is exactly the case this branch exists to protect.

   1. **Edit against the trace I already have open** (inline): skip the preview entirely. The user's open trace view updates live on each save. You give up the click / focus anchors (you'll ask which span type to edit) and the in-page Close button (the loop ends when the user says they're done).
   2. **Open the live preview page**: launch the chromeless template-preview page, which redirects to the most recent trace for `<key>` and streams click / focus anchors back to you. Prefer this when the user has no trace of this function on screen, or explicitly wants the dedicated preview.

   - **edit inline against the trace already on screen**: skip the preview; edit in place while the user's current view updates live → step 7
   - **open the live preview page**: launch the chromeless preview, then enter the edit loop → step 6
6. Launch the preview command **in the background** so the agent can keep iterating while the page stays open:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/startTemplatePreview.js" <functionKey>
   ```

   Run this with `run_in_background: true` on the Bash tool. **Do NOT append `&` to the command string** (the `run_in_background` parameter handles backgrounding; `&` causes the shell to return immediately and kills the process). The harness returns a task id and an output file path, and will deliver a `<task-notification>` with `status: completed` automatically when the process exits. Capture both: you'll need the output file path to poll between edit rounds.

   If stdout emits `{"event":"window-open-requested","url":"..."}`, immediately surface the URL in a normal chat message, e.g. `Opening Studio: <url> - click it if a window doesn't appear`, before continuing to poll. (This event means the open was *requested*, not that a window is confirmed on screen; the link is the reliable fallback when nothing surfaces.)

   The command **blocks until the user clicks Done in Studio**, then exits 0 with a single line like `Template preview closed [via studio]`. If the user instead just closes the browser tab without clicking Close, the process keeps running until the 30-minute timeout. The page auto-redirects to the most recent trace for the function and renders it with the org's current templates; it subscribes to SSE `template:updated` events and re-renders the affected span automatically, so the user does NOT need to refresh after each edit.

   🚨 **Stdout is a mixed JSONL + free-form stream.** Two event shapes flow over the same channel as the user interacts with the live preview:

   ```json
   {"event":"click","ts":"...","traceId":"...","spanId":"...","spanType":"...","sectionPath":"metadata","fieldPath":"metadata.tokens","rawText":"1234","selector":"..."}
   {"event":"focus","ts":"...","traceId":"...","spanId":"...","viewMode":"span","expandedSections":["metadata"]}
   ```

   `click` events fire when the user clicks a decorated element. `focus` events fire on initial load, on every span/trace selection change, and on shadow-root `<details>` open / close, so you always know the starting viewport even before any click.

   Free-form text (browser-handoff status lines, errors) goes through the same stdout. **You MUST filter to lines that parse as JSON before routing.** Skip anything that doesn't parse, never error out on non-JSON lines. The click event payload follows the template-anchor catalog returned by `mcp__plugin_bitfab_Bitfab__get_template_reference`; `fieldPath` matches a row there, `sectionPath` matches a section id. Unknown anchor values are omitted (the click handler drops them); `rawText` and `selector` are always present so you can disambiguate. Focus event fields are always present; `spanId` is null when the user is on the trace overview, `viewMode` is `"trace"` or `"span"`, and `expandedSections` lists the `data-section` ids whose `<details>` is currently open.
7. Each round of the loop. **Every `mcp__plugin_bitfab_Bitfab__get_template` and `mcp__plugin_bitfab_Bitfab__update_template` call must include `traceFunctionKey: <key>`** (the key picked in step 1); without it you'd edit the org-global instead of this function's override.

   **Two modes, set by step 5.** In **preview mode** a background process from step 6 is streaming the live page, and you tail it for anchors. In **inline mode** there is no such process: **skip every stdout / background-process instruction below** (step 1 and the process-exit check), drive the loop purely by asking, and rely on the user's already-open trace view re-rendering live on each save.

   1. **(preview mode only) Tail the background process's stdout** for any `{"event":"click",...}` or `{"event":"focus",...}` JSON lines that arrived since the previous round. Parse each line; skip non-JSON status lines.
      - **Most recent click** (if any) is ground truth for "what the user is referring to": its `spanType` is the template to edit, `sectionPath` + `fieldPath` (against the anchor catalog from `mcp__plugin_bitfab_Bitfab__get_template_reference`) tell you which region to change. If `fieldPath` is absent, fall back to `sectionPath` + `rawText`.
      - **Most recent focus** tells you what the user is currently looking at, even without a click. Use it to anchor a question when the user's instruction is ambiguous (e.g. "make this less verbose" while their focus is on a specific span) and to pick the span type when no click is available. Focus is also helpful to confirm in your acknowledgement that you're editing the same span the user is viewing.
      - If neither signal is present since the last round, fall through to step 2 and ask normally.
   2. Ask with `AskUserQuestion` : **"Tell me how you want your trace data to look and I'll make the changes in Bitfab. You'll see the changes update live in the Bitfab Studio trace view."** (In **preview mode** that live view is the tab opened from here; in **inline mode** it is the trace the user already had open, which re-renders on save. Phrase the sentence to match the active mode rather than always saying "opened from here".) **If there was a click in the previous round, anchor the question to it** by prepending a one-line acknowledgement (e.g. "You clicked the tokens value in metadata."). Keep the framing open-ended, do NOT list the six span types up front; let the user describe what they want and pick the span type from their answer. If the user names one of the six span types (`llm`, `agent`, `function`, `guardrail`, `handoff`, `custom`), use that. If their answer is unambiguous about the rendered region but doesn't name a span type AND there was no click, fall back to with `AskUserQuestion` which of the six span templates they want to edit. Don't guess the span type from a description like "make this less verbose," since the same description fits multiple templates.
   3. Call `mcp__plugin_bitfab_Bitfab__get_template` with `spanType` and `traceFunctionKey: <key>` to read the **live** content. The response labels its source: `scoped to traceFunctionKey "<key>"` (a per-key row already exists), `org-global override` (no per-key row yet, this is your seed for the first save), or `source: file <name>` (no DB rows at all). **Always** read before write: the prior round may have edited the same template, and overwriting blindly drops that work.
   4. Edit the returned source in-context, **one focused change per round**. Resist the urge to bundle multiple unrelated tweaks into a single save: small steps let the user see each effect land on the preview and redirect mid-loop if the change isn't quite right. Stay inside the documented Nunjucks variables and filters (per the reference). Don't introduce `{% extends %}`; the assembler injects into `base.njk`'s content block, so extends will break composition. When adding new visible regions, **decorate them with the catalog anchors** (`data-section`, `data-field-path`, `data-iter-index`) so future clicks resolve cleanly.
   5. Call `mcp__plugin_bitfab_Bitfab__update_template` with `spanType`, `traceFunctionKey: <key>`, and the full edited body. The tool upserts the per-function row in place (no version bump, no row juggling). On the first save for a span type the row is created; subsequent edits update it. The browser shows a brief "Editing..." status banner while the call is in flight, then a "Saved" flash when it returns, no extra signaling needed from your side.
   6. Acknowledge the save in one short line (e.g. "Saved."). The live view (the preview page in preview mode, or the trace the user already has open in inline mode) subscribes to SSE `template:updated` events and re-renders automatically, so do NOT tell the user to refresh. Do not paste the template body back into chat. After a non-trivial change you may briefly ask with `AskUserQuestion`  whether the result looks right before starting the next round; for obvious tweaks (a label rename, a colour swap), skip the check and proceed.

   **(preview mode only)** Before asking the user about another change, **check whether the background process from step 6 has exited**. The terminal signal is a line containing `Template preview closed` on stdout (the process exits 0 right after). In **inline mode** there is no background process and no Close button, so this check does not apply: the loop ends only when the user says they're done.

   **Detecting Close is a preview-mode step only; inline mode has no background process, so skip this whole paragraph.** Two equivalent ways to detect it: (a) if you've already received a `<task-notification>` for the captured task id with `status: completed`, the user has clicked Close; (b) otherwise, use the `Read` tool on the captured output file path and look for the `Template preview closed` line. Either signal means the loop should exit. **Use the same `Read` call to also harvest any new `{"event":"click",...}` and `{"event":"focus",...}` JSON lines for step 1 of the next round.**

   Two ways the loop ends:

   - **preview mode: background process exited (user clicked Close)**: exit the loop and acknowledge that template editing is done → the `setup-cleanup` skill
   - **user explicitly says they're done (the only exit in inline mode)**: exit the loop and acknowledge → the `setup-cleanup` skill
   - **user wants another change**: loop back and apply the next edit → step 7

   **Next:**

   - Preview mode: background process exited (user clicked Close) (mode `templates`): invoke the `setup-cleanup` skill with mode `templates`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - User explicitly says they're done (the only exit in inline mode) (mode `templates`): invoke the `setup-cleanup` skill with mode `templates`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
