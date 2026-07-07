---
name: assistant-dataset
description: Phase 3: Pick a Dataset and Label Traces phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Agent", "AskUserQuestion", "Monitor", "mcp__plugin_bitfab_Bitfab__search_traces", "mcp__plugin_bitfab_Bitfab__read_traces", "mcp__plugin_bitfab_Bitfab__read_trace_labels", "mcp__plugin_bitfab_Bitfab__update_agent_labels", "mcp__plugin_bitfab_Bitfab__list_datasets", "mcp__plugin_bitfab_Bitfab__create_dataset", "mcp__plugin_bitfab_Bitfab__add_traces_to_dataset", "mcp__plugin_bitfab_Bitfab__remove_traces_from_dataset", "mcp__plugin_bitfab_Bitfab__get_template_reference", "mcp__plugin_bitfab_Bitfab__get_template", "mcp__plugin_bitfab_Bitfab__update_template", "Skill"]
---

# Bitfab Assistant: Phase 3: Pick a Dataset and Label Traces

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `investigate`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `dataset` or `investigate`.**

A **dataset** is the named bucket of labeled traces an experiment replays against. This phase picks (or creates) one for the trace function, labels candidate traces, attaches them to the dataset, then hands off to the per-dataset review page where the user approves labels and can ask the agent to add or remove traces.

In `dataset` mode this phase is the entry point, Phase 1 (function picker) and Phase 2 (instrumentation/replay verification) are skipped, so the trace function key comes from the argument. Before calling any MCP tools, grep the codebase for the key (e.g. `grep -r "<traceFunctionKey>" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.rb" --include="*.go" --include="*.baml"`) and note the file path, every later step ("Label them yourself", and Phase 4 "Read the code" in `wizard` mode) needs it.

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Building dataset"`.

   **Pick or create a dataset**: Call `mcp__plugin_bitfab_Bitfab__list_datasets` with the trace function key. Then branch on whether any exist. Hold the chosen `datasetId` in working context, every step from here on uses it.

   - **no datasets exist for this function (list_datasets returned empty)**: **don't ask**: silently call `mcp__plugin_bitfab_Bitfab__create_dataset` with `traceFunctionKey: <key>` and `name: <key>` (just the trace function key as the name; the user can rename it later in the UI if they want). Hold the returned `datasetId` and continue. The first-time user shouldn't have to answer a name prompt before they've even seen the dataset. → step 2
   - **one or more datasets already exist**: present them to the user via `AskUserQuestion`, with one option per existing dataset (name · id · current trace count) plus a "Create new" option. Recommend the most recently used dataset that has traces. If the user picks an existing dataset, hold its id and continue. If the user picks "Create new", silently call `mcp__plugin_bitfab_Bitfab__create_dataset` with `name: "<key> #N"` where N is one more than the number of existing datasets (e.g. `eval-assistant #2`), don't ask for a name. Hold the new id and continue. → step 2
2. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Reviewing dataset"`.

   Open the dataset review page for the user **immediately** after picking or creating the dataset.

   **First, derive the function's current input shape** so the page can flag traces that won't replay against today's code (the dataset rows and trace detail show a "Can't replay" badge when a trace's recorded inputs no longer fit the current signature). Find the function registered under `<functionKey>` in the codebase (the value passed to `getFunction(...)` / the traced function), read its parameters, and build a compact JSON shape:

   ```json
   {"fields":[{"name":"query","type":"string"},{"name":"limit","type":"number","required":false}]}
   ```

   - `name`: each top-level input field, for a single object argument, its keys; for positional params, the parameter names.
   - `type` (optional): one of `string` / `number` / `boolean` / `object` / `array` / `null` / `unknown`. Omit if unsure.
   - `required` (optional): defaults to true; set `false` for optional params.

   This is best-effort. If you can't confidently determine the shape (no clear signature, dynamic args), **skip it** and open the bare path, the page falls back to flagging only traces that captured no inputs. Never block or ask the user about this.

   Then base64-encode the shape and pass it as a `?shape=` query param (no shape -> open the bare path):

   ```bash
   SHAPE=$(printf %s '{"fields":[{"name":"query","type":"string"}]}' | base64 | tr -d '\n')
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio/trace-functions/<functionKey>/datasets/<datasetId>?shape=$SHAPE"
   ```

   The command navigates an existing session or opens a new one automatically.

   **This navigation is mandatory even though Studio is already open.** The initial mode open lands on `/studio` (the home), not this dataset's page. Labels and traces stream live only into the per-dataset page above, so a Studio session sitting anywhere else does NOT satisfy this step. Always navigate with the `<datasetId>` path once you hold the id.

   **After opening, check whether the dataset already has traces.** Call `mcp__plugin_bitfab_Bitfab__search_traces` with `traceFunctionKey: <key>`, `datasetId: <datasetId>`, `limit: 1` to see if the dataset is populated.

   - **the dataset already has traces (search returned results)**: The dataset is not empty. Tell the user the dataset page is open with the existing traces, and they can review, approve, or edit labels there. Then go straight to waiting for their review. Do NOT ask how to source new candidates or offer to find more traces. The user should review what's already in the dataset first; they can request more traces via the "Edit with agent" button if needed. → step 10
   - **the dataset is empty (search returned no results)**: The dataset has no traces yet. Tell the user the dataset page is open in a "waiting for traces" state, and that traces will appear there live as you search and add them. Then proceed to find candidate traces. → step 3
3. **Ask how to source candidate traces.** Before searching, decide *where* the candidate traces come from. Three real options:

   1. **Define new criteria**: agent searches unlabeled traces shaped by what the user wants to surface. Best when the user has a hypothesis or a specific failure pattern in mind.
   2. **Reuse existing labels for this function**: pull traces that already have a validated human or approved-agent label (from any prior dataset on this function) and seed the new dataset with them. Best when the user wants to hill-climb off prior labeling work, same labels, different cut, add more later.
   3. **Open / you decide**: agent samples broadly with no hypothesis, ignoring prior labels for the search shape. Best for discovery passes.

   **Probe for prior label volume first** so the recommendation is grounded. Call `mcp__plugin_bitfab_Bitfab__search_traces` with `traceFunctionKey: <key>`, `validated: true`, `limit: 50` to see roughly how many validated labels already exist for this function. Note the count, you'll need it for the recommendation and for option 2.

   Then use `AskUserQuestion` with the three options below. Recommend:
   - Option **2 (Reuse)** if the function has 5+ validated labels AND the picked dataset is freshly created or empty (the user is starting a new cut and prior work is the right baseline)
   - Option **1 (Define)** if the user has a hypothesis or the function has < 5 validated labels (not enough prior signal to reuse)
   - Option **3 (Open)** if the user explicitly says they don't have a hypothesis yet and there's not much prior labeling

   Hold the chosen mode in working context, the next steps branch on it.

   > A) **Define new criteria**: tell me what to find (failure pattern, customer reports, etc.) and I search unlabeled traces → step 5
   > B) **Reuse existing labels for this function**: seed the dataset with traces that already have validated labels, then optionally add more *(recommended)* → step 4
   > C) **Open, you decide**: broad sample with no hypothesis; ignore prior labels for the search shape → step 6
4. **Seed dataset from existing validated labels.** Reachable only when the user picked Option B in `ask-search-mode`. Pull traces that already have a validated label (human-authored, or agent-authored and human-approved) for this function, attach them to the picked dataset, and route on whether the user also wants to add more.

   1. Call `mcp__plugin_bitfab_Bitfab__search_traces` with `traceFunctionKey: <key>`, `validated: true`, and a generous `limit` (50 is the cap). Both `labelResult: true` and `labelResult: false` matter, failures are the hill-climbing signal, but passes anchor the regression boundary. If 50 isn't enough to cover the function's labeled history, run a second call with `labelResult: false` only to bias toward fails first, then a third with `labelResult: true`. De-dupe trace IDs across calls.
   2. Call `mcp__plugin_bitfab_Bitfab__read_trace_labels` on the resulting trace IDs so the labels + annotations are in working context. Don't re-label them, these are already validated. `mcp__plugin_bitfab_Bitfab__read_trace_labels` returns only label + annotation + approved (no span content) and takes up to 100 IDs per call, so the deduped set from step 1 is usually a single call; if it deduped more than 100 IDs, split them into chunks of 100 and call `mcp__plugin_bitfab_Bitfab__read_trace_labels` once per chunk (sequential is fine, the responses are small).
   3. Call `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` once with `datasetId` (the one picked in `list-datasets`) and the full deduped trace ID array. The call is idempotent, so re-attaching IDs already in the dataset is a safe no-op.
   4. Briefly summarize for the user: "Seeded the dataset with N reused labels (M fails, K passes). Want me to find more candidates to label, or is this set enough to move on?"

   > A) **Find more candidates to label**: go through the regular intent + search + label flow on top of the reused set → step 5
   > B) **Move on with just the reused set**: skip further labeling; the dataset page is already open with the reused traces streamed in *(recommended)* → step 10
5. **Ask what kinds of traces to find**: The user picked "Define new criteria" (or arrived here from the reuse path wanting more). Find out what they're actually trying to surface. The trace function may have thousands of traces; "what should I label?" is the question that makes the rest of this phase useful.

   When asking, use `AskUserQuestion` with these options (and a free-text fallback so the user can describe something specific):

   - **A, Failures of a certain kind** *(recommended when the user already has a hypothesis)*, they tell you the pattern (empty outputs, hallucinated tool args, regressions on a specific input shape, etc.) and you search for matching traces
   - **B, Recent customer complaints / reports**: they paste or describe specific incidents and you find the matching traces by user, session, or time window
   - **C, Open-ended, you decide**: no hypothesis yet; you sample broadly across recent traces, look for diversity, and surface anything that looks like a candidate failure or interesting edge case

   Hold the user's answer (the chosen option **and** any free-text detail) in working context, the next step uses it to shape the `mcp__plugin_bitfab_Bitfab__search_traces` filters and which traces to prioritise reading. If they pick C, default to recent + diverse + non-empty outputs.
6. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Searching traces"`.

   **Find unlabeled traces**: Search without label filters to find unlabeled traces for the trace function. **Shape the search by the intent captured in the previous step** (or by the prior dataset's existing labels, if any): Option A = filter to traces matching the user's described failure pattern; Option B = filter by the user, session, or time window of the reported incidents; Option C = default sweep (recent, diverse inputs, non-empty outputs). Use `mcp__plugin_bitfab_Bitfab__search_traces` with the relevant filters, then `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "summary"` to read candidates and identify which are worth labeling, look for diverse inputs, traces that produced output (not empty), and traces that cover different scenarios under the chosen intent. Filter out near-duplicates and uninteresting traces. If every trace is already labeled and attached to this dataset, you can move straight on with no new candidates.
7. **Ask how the user wants to label**: Before any verdicts go on these candidate traces, use `AskUserQuestion` how the user wants to label them. There are exactly two modes, and the answer determines whether you call `mcp__plugin_bitfab_Bitfab__update_agent_labels` at all:

   > A) **Agent labels first, I approve / edit**: agent makes a first pass; you approve or edit each verdict in the labeling page *(recommended)* → step 8
   > B) **I'll label them manually**: no agent verdicts; you label every trace from scratch in the labeling page → step 9

   Recommend Option A, an agent first pass turns the labeling page into a quick approve/edit review. But respect the user's choice: if they pick B, do **not** call `mcp__plugin_bitfab_Bitfab__update_agent_labels` for any of these candidates. They want to label from scratch in the labeling page, with no agent verdicts pre-filled. If no new candidate traces were found in the previous step, skip this question and continue.
8. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Labeling traces"`.

   **Agent first pass: label them yourself before opening the labeling page**: Reachable only when the user picked Option A in the previous step. **You** label the approved candidate traces so the labeling page becomes an approve/edit review instead of a blank labeling session. Run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" <trace-id...> --scope full` **once** with all the approved trace IDs. It fans the reads out in parallel batches of 10 and writes the combined result to a temp file; the command prints `{"status":"ok","outputFile":"..."}` as JSON, so `Read` that `outputFile`. **Use this command here, not the `read_traces` MCP tool directly:** `read_traces` caps at 10 IDs, so calling it for the approved set would re-introduce the serial per-batch fan-out `readTracesBatched` exists to replace. Read each trace's inputs / output / spans yourself, and decide for each one whether it looks like a PASS or a FAIL. **Ground your judgment in the codebase, not just the trace text.** Before you start labeling, read the instrumented function in the user's source (located in Phase 2 in `wizard` mode, or via the grep step in this phase's intro in `dataset` mode) and any nearby code that explains intent, comments, docstrings, README sections, related tests, BAML files, so you know what the function is *supposed* to do and what "good" looks like for it. Apply the same context to every trace: does this output achieve the function's goal as expressed in the code? Does it match the patterns in the already-validated traces? **First decide how you'll produce the verdicts, judge serially yourself or fan the judging out per the fan-out block immediately below, based on how many candidates there are. Do not persist yet.** However you produce them, the verdicts then land in a single `mcp__plugin_bitfab_Bitfab__update_agent_labels` call with an array of `{ traceId, label, annotation }` objects, **both `label` (true for pass, false for fail) and `annotation` (a one-or-two-sentence explanation written for the human reviewer, ideally referencing what the code is trying to do) are required for every trace**. Commit to a verdict, if you genuinely cannot decide, you didn't read the trace or the code carefully enough. The labels you save here start unapproved; they only become part of the validated dataset once a human approves them in the labeling page.

   **Scale the judging with fan-out when there are many items.** Per-item judging is embarrassingly parallel: each verdict depends only on that one item's own artifacts (plus the fixed rubric and any shared context you gather once below), never on the other items, and the judge only reasons and returns JSON, it never edits files. So pick serial or fan-out by the item count:

   - **At or below ~15-20 items: stay serial.** Judge every item yourself, inline in this agent, exactly as described above. Below that threshold the subagent spawn overhead outweighs the parallelism, so serial is faster.
   - **Above ~15-20 items: fan out.** Split the items into batches (aim for one batch per subagent, roughly 8-12 items each, so even a large dataset resolves in a handful of subagents) and spawn one read-only subagent per batch with the Agent tool, `subagent_type: "general-purpose"`. Each subagent reasons over the payloads you hand it and returns its batch's verdicts as JSON. These judges only read and return data: do **NOT** pass `isolation: "worktree"` and do **NOT** depend on bypass permissions (that gating is only for the code-editing experiment fork in `pick-execution-mode`). A judge never edits files, runs replay, opens Studio, or calls MCP tools.

   Make each subagent prompt fully self-contained: its batch's per-item payloads (each item carries its own artifacts, enumerated below), the fixed rubric, and any shared context you gathered once (so no subagent re-derives it or touches the repo). Tell it to return one verdict entry per item in the exact shape this step persists, and nothing else.

   **Then collect and persist once.** Wait for every batch, concatenate their verdict arrays into the single full set covering all items, and make the one batched persist call this step already describes, unchanged. Fan-out changes only how you produce the verdicts, never how they are stored or routed: same call, same shape, same buckets, same downstream steps.

   **Per-item inputs for this step (however you produce the verdicts):** each candidate trace's own artifacts, its input and output (from the `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" --scope full` load above), judged against the shared context, what the function is supposed to do and what "good" looks like for it (the instrumented function and the nearby intent you read above, plus the patterns from the already-validated traces). The verdict for each trace is PASS or FAIL plus the one-or-two-sentence annotation, the `{ traceId, label, annotation }` shape `mcp__plugin_bitfab_Bitfab__update_agent_labels` takes. When you fan out, each subagent's prompt carries its batch's trace inputs/outputs plus that shared context and returns its batch's `{ traceId, label, annotation }` array, which you concatenate across batches. However the verdicts are produced, you make the single `mcp__plugin_bitfab_Bitfab__update_agent_labels` call (one array, all traces) just as described above. The labels still land unapproved for human review in the labeling page no matter how they were produced.

   **The cross-trace failure-pattern synthesis stays separate.** Phase 4 (`understand-failures`) is a deliberate join: it reads all the labels at once so the holistic "these N traces fail the same way" view is never lost. Per-trace labeling here is mechanical and independent, and when you fan out, each subagent sees only its own batch, so do not fold cross-trace synthesis into the labeling, that recognition is Phase 4's job on the full set.

   > 🚨 **HARD RULE, DO NOT SKIP (agent-first mode only):** When the user picked Option A, you MUST call `mcp__plugin_bitfab_Bitfab__update_agent_labels` with verdicts for every approved trace BEFORE navigating Studio to the labeling page. Sending the user into an agent-first review with no pre-labeled verdicts is a process violation. (In manual mode this step is unreachable, and the rule does not apply.)

   > **Made a mistake?** If you realize a verdict was wrong (e.g., you mislabeled a trace or want to re-evaluate), call `mcp__plugin_bitfab_Bitfab__update_agent_labels` again with `{ traceId, archive: true }` for those traces. The previous label is hidden (kept for audit), and you can re-label the trace from scratch with another `update_agent_labels` call.
9. **Attach candidate traces to the dataset**: Call `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` with the `datasetId` chosen earlier and the array of approved candidate trace IDs (in agent-first mode, the ones you just labeled; in manual mode, the candidates the user approved in find-unlabeled). The call is idempotent, re-adding traces already in the dataset is a no-op, so it's safe to include the full set. If no new candidate traces were approved (the dataset was already populated), skip this step.

   The dataset review page is already open in Studio (opened earlier in `open-page`). Each trace you attach streams in live via real-time events, so the user sees them appear instantly. After attaching, tell the user the dataset is populated and ready for their review, then proceed to `await-event`.
10. 🚨 **MANDATORY: Set up a Monitor IMMEDIATELY.** Do not skip this step or defer it. The user is reviewing traces in Studio right now and will click Done or Edit with agent. If you don't monitor, you will miss the event.

   Use the **Monitor tool** to tail the durable Studio event file for new JSON events:

   ```bash
   tail -f -n +<NEXT_LINE> <eventFile> | grep -E --line-buffered '"event"'
   ```

   `<eventFile>` is the path from the `monitor` line emitted by `openStudioTo.js` in the `open` step (the daemon appends events here for the whole session, so tailing it replays anything that happened before you attached). `<NEXT_LINE>` is one past the last line you read (e.g. if you read 5 lines, use `-n +6`).

   The Monitor streams ALL events from Studio. Route on the `event` field in each JSON line:

   - `{"event":"return-to-agent",...}`, user clicked **Done**. Dataset review is complete.
   - `{"event":"edit-with-agent",...,"datasetId":"..."}`, user clicked **Edit with agent**. Go to the modify loop, then come back here.
   - `{"event":"session-ended",...}`, user closed Studio entirely.
   - `{"event":"navigated",...}`, Studio navigated to a new page (informational).
   - `{"event":"element-clicked",...}` / `{"event":"focusChanged",...}`, user interaction events (used during template editing).

   **Stay silent while monitoring.** Do not narrate each event. Only speak when you reach a branch point or hit an error.

   **Template editing during labeling.** The user may ask to edit a template in chat while the Monitor is running (e.g. "change the LLM view"). This arrives as a user message, not a Studio event. If so, go to the edit-template-loop step. **Do NOT invoke `/bitfab:setup templates`**: that navigates Studio away from the dataset page.

   - **`event: edit-with-agent`**: user clicked Edit with agent on the dataset page. Go to the modify loop, then come back here to read the next event → step 11
   - **`event: return-to-agent`**: user clicked Done on the dataset page. Dataset review is complete, move on to build + confirm the dataset → step 13
   - **`event: session-ended`**: user closed Studio. Stop the flow → the `assistant-cleanup` skill
   - **user asks to edit a template in chat**: user wants to change how traces render (e.g. 'edit the llm template', 'change the function view'). Go to the edit-template-loop, then come back here → step 12

   **Next:**

   - `event: session-ended` (mode `wizard` or `dataset` or `investigate`): invoke the `assistant-cleanup` skill with the current mode (`wizard` or `dataset` or `investigate`).
11. **Modify loop: add or remove traces in chat**: The dataset page is still open in Studio and the user wants you to add or remove traces. Ask in plain chat:

   > What would you like to add or remove? You can describe by criteria (e.g. "drop empty-output traces", "add 5 more from last week with errors") or paste explicit trace IDs.

   Then wait for the user's next message. It will contain their answer. Do NOT use `AskUserQuestion` here (the answer is free-form and options would just add an extra step before the user can type).

   Then act on it:

   - **Adding traces:** find candidates with `mcp__plugin_bitfab_Bitfab__search_traces` / `mcp__plugin_bitfab_Bitfab__read_traces`, then respect the labeling mode the user chose earlier in this phase (the ask-labeling-mode step). In **agent-first mode (Option A)**, label them yourself with `mcp__plugin_bitfab_Bitfab__update_agent_labels` (same rigor as label-self: every trace gets a verdict + annotation, grounded in the code) before attaching. In **manual mode (Option B)**, do NOT call `mcp__plugin_bitfab_Bitfab__update_agent_labels`. **If no labeling mode was selected** (the user took the Reuse → Move-on path that bypasses ask-labeling-mode, or find-unlabeled returned no candidates so ask-labeling-mode self-skipped), default to **agent-first mode (Option A)**: match the recommended default and label new candidates yourself before attaching. Either way, call `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` to attach.
   - **Removing traces:** call `mcp__plugin_bitfab_Bitfab__remove_traces_from_dataset` with the trace IDs to remove. The traces themselves aren't deleted, only their membership in the dataset.

   The dataset page reflects each add/remove live (SSE), so the user sees changes flow in as you make them. When you're done, summarize what changed in chat and **return to the await-event step to read the next event**. The user can click Edit with agent again for another modify round, or Done to finalize.
12. **Edit a trace view template inline.** The user wants to change how a span type renders. Handle this with MCP tools; do NOT invoke `/bitfab:setup templates`.

   1. Call `mcp__plugin_bitfab_Bitfab__get_template_reference` if you haven't already this conversation. It documents the Nunjucks engine, variables, and filters.
   2. Identify the span type (`llm`, `agent`, `function`, `guardrail`, `handoff`, `custom`). If ambiguous, ask.
   3. Call `mcp__plugin_bitfab_Bitfab__get_template` with `spanType` and `traceFunctionKey` (from Phase 1) to read the current template.
   4. Edit the template. Stay inside the documented variables and filters. Do not use `{%raw%}{% extends %}{%endraw%}`.
   5. Call `mcp__plugin_bitfab_Bitfab__update_template` with the full edited body. The dataset page re-renders automatically via SSE.
   6. Acknowledge in one line. Do not paste the template body back.

   Then return to the await-event step. If the user wants more edits, they'll ask again and you'll re-enter this step.
13. **Build the dataset**: You already know the trace IDs in this dataset (you attached them in earlier steps and tracked any add/remove from modify rounds). Load each trace's label + annotation into context. **Which tool depends on `costRun`:**

   - **`costRun` is false (the common case):** call `mcp__plugin_bitfab_Bitfab__read_trace_labels` with all of them. It returns only the verdict fields (label + annotation + approved, no span content) and takes up to 100 IDs per call, so for almost every dataset this is a single call. Only if the dataset has more than 100 traces, split the IDs into chunks of 100 and call `mcp__plugin_bitfab_Bitfab__read_trace_labels` once per chunk; the responses are small, so plain sequential calls are fine.
   - **`costRun` is set:** run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" <trace-id...> --scope full` **once** with all the trace IDs instead, because the Phase 5 cost-delta step reads each original trace's recorded token usage from this load and `mcp__plugin_bitfab_Bitfab__read_trace_labels` does not carry it. The command fans the `scope: "full"` reads out in parallel batches of 10 and writes the combined result to a temp file; it prints `{"status":"ok","outputFile":"..."}` as JSON, so `Read` that `outputFile`. **Use this command here, not the `read_traces` MCP tool directly:** `read_traces` caps at 10 IDs, so calling it for the dataset would re-introduce the serial per-batch fan-out `readTracesBatched` exists to replace.

   **Re-read them fresh here even if you read them earlier in this phase:** the Studio labeling review persists human approvals and label/annotation edits to the DB, so cached context from the find / label steps can be stale. This is the working set for confirm + every Phase 5 experiment.
14. **Confirm the dataset**: Present the dataset via `AskUserQuestion`: each entry showing (trace ID, label, annotation summary). The dataset must contain at least one **validated failing label**: i.e. at least one trace where a human either authored or approved a `false` label. To check, call `mcp__plugin_bitfab_Bitfab__search_traces` restricted to the dataset trace IDs with `validated: true` and `labelResult: false`. Two outcomes:

   - **gate fails (no validated failing label, search returns nothing)**: tell the user and loop back to find or label more unlabeled traces → step 6
   - **gate passes (at least one validated failing label)**: get explicit approval, then continue → step 15

   Unapproved agent labels do **not** satisfy this gate by design, `validated: true` excludes them.
15. **Hold in-context**: This approved dataset is the benchmark for all experiments in Phase 5. Keep both the `datasetId` and the trace IDs in your working context throughout.

   **Next:**

   - Mode `wizard` or `dataset` or `investigate`: invoke the `assistant-diagnose` skill with the current mode (`wizard` or `dataset` or `investigate`).
