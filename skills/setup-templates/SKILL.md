---
name: setup-templates
description: Templates phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_trace_functions", "mcp__plugin_bitfab_Bitfab__search_traces", "mcp__plugin_bitfab_Bitfab__get_template_reference", "mcp__plugin_bitfab_Bitfab__get_template", "mcp__plugin_bitfab_Bitfab__save_template", "Skill"]
---

# Bitfab Setup: Templates

**Run only when mode is `templates`.**

Iterate on span-rendering templates for one trace function. Read the current template and reference, apply the requested change, then save it with traceFunctionKey set. Provide the regular template-preview link when useful. Keep review decisions in chat.

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

   Call `mcp__plugin_bitfab_Bitfab__search_traces` with `{ traceFunctionKey: "<key>", limit: 1 }`. If the response contains a trace ID, continue. If the response indicates no traces exist (e.g. `No traces found matching the filter criteria.`), exit and tell the user in one short line: `No traces yet for <key>. Run your app to generate one, then re-run \`/bitfab:setup templates <key>\` to preview.` Do NOT block waiting; the user re-invokes when they have a trace.

   - **trace exists**: continue and choose the preview mode → step 5
   - **no traces yet for this function**: exit and tell the user to generate a trace and re-run → the `setup-cleanup` skill

   **Next:**

   - No traces yet for this function (mode `templates`): invoke the `setup-cleanup` skill with mode `templates`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
5. The user can watch template saves in a trace they already have open, or on the template-preview page. Both update through normal template:updated events. Offer a preview link when useful. Ask for requested changes in chat. - **edit inline against the trace already on screen**: skip the preview; edit in place while the user's current view updates live → step 7
   - **open the live preview page**: provide the preview link, then enter the edit loop → step 6
6. Run node "${CLAUDE_PLUGIN_ROOT}/dist/commands/startTemplatePreview.js" <key> and relay the returned URL as a clickable link. Continue the template edit loop in chat. Template saves update the preview through normal organization events. The link command exits immediately.
7. Each edit is driven by the user’s request in chat. Include traceFunctionKey: <key> in every template read and save. Ask which span or region they mean when unclear.

   2. Ask the user what they want changed in the trace view. Identify the span type and rendered region from their answer. If that is ambiguous, clarify it in chat before editing. Both the regular trace view and the linked preview update on save.

   3. Call `mcp__plugin_bitfab_Bitfab__get_template` with `spanType` and `traceFunctionKey: <key>` to read the **live** content. The response labels its source: `scoped to traceFunctionKey "<key>"` (a per-key row already exists), `org-global override` (no per-key row yet, this is your seed for the first save), or `source: file <name>` (no DB rows at all). **Always** read before write: the prior round may have edited the same template, and overwriting blindly drops that work.
   4. Edit the returned source in-context, **one focused change per round**. Resist the urge to bundle multiple unrelated tweaks into a single save: small steps let the user see each effect land on the preview and redirect mid-loop if the change isn't quite right. Stay inside the documented Nunjucks variables and filters (per the reference). Don't introduce `{% extends %}`; the assembler injects into `base.njk`'s content block, so extends will break composition. When adding new visible regions, **decorate them with the catalog anchors** (`data-section`, `data-field-path`, `data-iter-index`) so future clicks resolve cleanly.
   5. Call `mcp__plugin_bitfab_Bitfab__save_template` with `spanType`, `traceFunctionKey: <key>`, and the full edited body. The tool upserts the per-function row in place (no version bump, no row juggling). On the first save for a span type the row is created; subsequent edits update it. The preview updates when the save completes.
   6. Acknowledge the save in one short line (e.g. "Saved."). The live view (the preview page in preview mode, or the trace the user already has open in inline mode) subscribes to SSE `template:updated` events and re-renders automatically, so do NOT tell the user to refresh. Do not paste the template body back into chat. After a non-trivial change you may briefly ask with `AskUserQuestion`  whether the result looks right before starting the next round; for obvious tweaks (a label rename, a colour swap), skip the check and proceed.


   Continue until the user says they are done. - **user explicitly says they're done (the only exit in inline mode)**: exit the loop and acknowledge → the `setup-cleanup` skill
   - **user wants another change**: loop back and apply the next edit → step 7

   **Next:**

   - User explicitly says they're done (the only exit in inline mode) (mode `templates`): invoke the `setup-cleanup` skill with mode `templates`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
