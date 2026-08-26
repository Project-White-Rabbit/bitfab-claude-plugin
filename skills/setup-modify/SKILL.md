---
name: setup-modify
description: Modify phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__save_trace_plan", "mcp__plugin_bitfab_Bitfab__confirm_trace_plan", "mcp__plugin_bitfab_Bitfab__get_trace_plan", "mcp__plugin_bitfab_Bitfab__list_trace_plans", "mcp__plugin_bitfab_Bitfab__cancel_trace_plan", "Skill"]
---

# Bitfab Setup: Modify

**Mode:** you were dispatched with a mode (`wizard` or `instrument` or `modify`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard`, `instrument` or `modify`.**

Adjust an **existing** trace setup. Requires existing SDK usage in the codebase, if none exists, run Instrument first. Triggered explicitly by `/bitfab:setup modify`, or selected from the AskUserQuestion at Instrument's existing-SDK-usage menu when existing SDK usage is found.

Every Modify cycle targets **exactly one** trace function. Never batch multiple trace functions in one cycle, if the user wants more, loop via the step 7 menu.

1. **Skip the search when you already hold the keys**: arriving from Instrument's existing-SDK-usage menu means you ran exactly this search one step ago, and re-running it makes the user watch the same greps twice for the same answer. Otherwise **gather existing trace functions** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). List each key alongside its root function (or, for keys registered only via a framework handler, the handler registration site, handler keys have no decorated root and that is expected). If none are found, tell the user Modify needs existing instrumentation and suggest `/bitfab:setup instrument`.

   - **the key is already settled (passed as `/bitfab:setup modify <key>`, or named at Instrument's existing-SDK-usage menu)**: skip the which-function question, the user already answered it → step 3
   - **no instrumented trace functions exist (nothing to modify)**: continue → the `setup-cleanup` skill
   - **one or more trace functions exist**: continue → step 2

   **Next:**

   - No instrumented trace functions exist (nothing to modify) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
2. **Pick exactly ONE trace function to modify.** (You only reach this step when the key is not already settled; a key named at Instrument's existing-SDK-usage menu or passed as `/bitfab:setup modify <key>` routes past it.) Use `AskUserQuestion` with the list of existing keys. Recommend the one the user most recently instrumented (or the one most recently referenced in the current session) and explain why in one line.
3. **Reconcile the most recent confirmed trace plan with the CURRENT code before treating either as the `before` `TracePlanTree`.** A stored plan preserves historical user intent, sample inputs/outputs, stable node ids, and surrounding context; it is never proof of what the code captures now. Code can add, remove, rename, move, or unwrap spans after confirmation, so every Modify cycle MUST reread and reconcile current instrumentation even when a prior plan exists.

   1. Call `mcp__plugin_bitfab_Bitfab__get_trace_plan` with `{ traceFunctionKey: "<chosen key>" }` (no `planId`). Two outcomes:
      - **Prior plan found**: parse the JSON block and hold its `tree` and `capturedNodeIds` as the stored snapshot. **Also record the plan's `id`** (the `Trace plan: <uuid>` line at the top of the response): step 5 updates THAT plan in place rather than uploading a competing plan. Do not skip the current-code read below.
      - **"No prior confirmed trace plan found"**: that answer only rules out a *confirmed* plan, which is not the same as no plan. **Before concluding there is none, probe `mcp__plugin_bitfab_Bitfab__list_trace_plans` with `{ traceFunctionKey: "<chosen key>", status: "awaiting" }`** (a silent probe, don't narrate it). An unconfirmed plan for this key is common: an `/bitfab:setup analyze-repo` draft nobody wired up, or a plan whose confirmation never landed because Studio was closed the wrong way.
        - **An awaiting plan came back**: take the newest, read it with `mcp__plugin_bitfab_Bitfab__get_trace_plan` `{ planId }`, and treat it exactly like the prior-plan case above (hold its tree and captured set as the stored snapshot, record its id for step 5 to update). Say in one line that you are revising the existing unconfirmed plan for this key. **If the probe returned several, retire the ones you did not take with `mcp__plugin_bitfab_Bitfab__cancel_trace_plan`**: a key that already accumulated duplicates should leave this cycle holding one plan, not the newest plus a tail of reusable strays.
        - **Nothing came back**: there is genuinely no stored snapshot for this key (key created outside the skill, or an older cycle that predates the stored plan). You have no prior plan id, so step 5 creates a plan after the current-code read.
   2. **Inventory the current instrumentation from code (mandatory in both outcomes).** Search for the exact chosen key's root registration plus every span bound to that trace function/client and every keyed framework handler, run wrapper, middleware, or processor that contributes auto-captured spans. Read every matched implementation and every still-existing file referenced by the stored snapshot. Map what the code captures now into a code-derived `TracePlanTree` (`{ rootId, nodes: { [id]: TraceNode } }`, same shape used in Instrument's build-trace-plan step). Each `TraceNode` carries `id`, `name`, `kind` ("manual" | "auto" | "pure"), `file`, `line`, `signature`, `parentId`, `childIds`, plus `framework` for `[auto]` lines. Do not limit the search to filenames in the stored plan: newly added spans often live in files the old plan never mentioned.
   3. **Reconcile the stored snapshot with the code-derived tree.** The reconciled `before` tree and capture set must describe the code that would execute today:
      - **Present in code, absent from the stored plan**: add the node. Current manual and auto-captured spans belong in `capturedNodeIds`; new uninstrumented surrounding context stays `pure` and uncaptured.
      - **Present in the stored plan, no longer instrumented in code**: remove it from `capturedNodeIds`. Keep it as `pure` context only when the function still exists and is useful context; otherwise remove it and repair parent/child links.
      - **Moved or renamed**: preserve the existing node id only when the implementation identity is clear, then refresh its name, file, line, signature, relationships, and changed analysis. Otherwise treat it as one removed node plus one added node.
      - **Root changed**: when the current trace boundary is a different function, replace the tree's rootId with that current root's node id and rebuild the tree beneath it. A structural save_trace_plan update supports changing the root while keeping the same plan id, so never retain an obsolete root or create a competing plan merely to preserve the old rootId.
      - **Unchanged**: preserve the stored node id, samples, analysis, and user-confirmed mock/capture intent.

   Before holding the reconciled tree, enforce the same sample completeness as a newly built plan: **every captured node, including each manual or auto span discovered only from current code, MUST include `sampleInput` and `sampleOutput`.** Preserve stored samples for unchanged nodes. For a drift-discovered captured node, or an older captured node whose stored samples are missing, construct realistic values from its current parameter and return types now. Do this during reconciliation even when the user requested no explicit modifications, because step 4 may copy the `before` tree unchanged.

   Enforce analysis completeness at the same boundary: **every node in the reconciled tree MUST carry `analysis` before it becomes the `before` tree.** Preserve stored analysis only for an unchanged node whose body is unchanged. Read and classify every drift-discovered node, changed node, or older node whose analysis is missing using the decision procedure in step 4. Do this during reconciliation even when the user requested no explicit modifications, so copying `before` unchanged can never persist an unclassified captured span or context node.

   If this comparison finds drift, tell the user in one line what was stale (added, removed, moved, renamed, or unwrapped nodes) before presenting the refreshed plan. Never silently carry an obsolete captured node forward, and never omit a current manual/auto span just because it was absent from the stored snapshot.

   Hold the reconciled `before` tree in memory. It seeds the `after` tree you build in step 4 and becomes the left-hand side of the inline-fallback diff in step 5. Do not present it yet.
4. **Build the modified trace plan as a `TracePlanTree` under the same PURELY ADDITIVE constraint as Instrument's build-trace-plan step.** Start from the `before` tree built in step 3 and produce an `after` tree of the same shape (`{ rootId, nodes: { [id]: TraceNode } }`) that applies the user's requested modifications. Reuse node ids unchanged for nodes that survive, that lets the trace plan UI show only what actually changes, and mint new ids for added nodes.

   **If the user didn't request anything specific** (no modifications were named in the skill invocation or earlier in the conversation), produce an `after` tree identical to the `before` tree. Don't invent changes. The user will edit the capture set directly in the UI in step 5.

   The modified tree must be implementable without behavior changes. If a requested modification requires awaiting a stream that wasn't awaited, delaying a call, reordering operations, blocking a callback, or restructuring control flow, tell the user which part doesn't fit and why, and ask them to refine the request (or suggest splitting into multiple cycles). Never present a behavior-changing approach as an option.

   **Every captured node MUST include `sampleInput` and `sampleOutput`**: same hard rule as Instrument's build-trace-plan step. Carry samples forward unchanged for surviving nodes; for newly added nodes (intermediate spans, deeper leaves, a new upstream/downstream root), construct realistic example values from the function's parameter and return types (Read the file and its return-type imports if needed). Do not advance to step 5 with a captured node missing either field.

   **Every node in the modified `TracePlanTree` MUST carry an `analysis`**, same hard rule and same procedure as Instrument's build-trace-plan step, so any context node the user toggles into capture already has a replay decision. `analysis` is `{ classification, mockable?, unmockableReason?, inputSerializable?, outputSerializable?, innerCall?, sideEffectKind?, readKind? }` (`pure` | `model_call` | `external_read` | `side_effect`); the server derives `mockOnReplay` and the summary from it, so you don't send them. Mockable `external_read` and `side_effect` nodes default to mocked replay, except broad external parents with live descendants; `model_call` and `pure` nodes default to live replay. Carry existing `analysis` forward unchanged for surviving nodes only when it is already present and the node body did not change. For surviving nodes from older prior plans that lack `analysis`, or nodes whose body changed, read the node body now and backfill `analysis` before presenting the plan. Classify each missing, changed, or **newly added** node from its body, not its name, using that step's decision procedure (first match wins): (1) is itself the model call (an auto-captured model leaf, or a span that invokes the model inline in its own body with no separately-represented model-call child) → `model_call` (re-runs live; never mock); a framework wrapper or orchestrator (a LangChain `chain.invoke`, a LangGraph node, the root that just calls model-call children) whose model call is a child node is `pure`, not `model_call`, don't bubble the child's classification up; (2) own body mutates external state (DB write, outbound `POST/PUT/DELETE`, queue/email/charge/file/vector write) → `side_effect` with `sideEffectKind`, this wins over model_call when one span does both; (3) own body reads external mutable state (DB `SELECT`, `GET`, vector search, cache read) → `external_read` with `readKind`; (4) otherwise → `pure` (local compute, in-memory). Classify a span by its OWN body, excluding work already represented by child nodes (don't double-count). Prefer the smallest external boundary: if a read/write wrapper contains parsing, ranking, prompt construction, model calls, or other live code, put `external_read` / `side_effect` on the lower DB/HTTP/write call and classify the wrapper by its remaining own body. **Nested `model_call`s are always a bug:** no `model_call` may have a `model_call` ancestor or descendant, the leaf that hits the API is the only model call and the chain, graph node, or wrapper above it is `pure` even when the framework labels it an LLM or chat span; if two `model_call`s land on one parent-to-child line, demote the upper to `pure`. **Then set mockable from wrapper kind and execution context, using the build-trace-plan rules:** a manual withSpan / @span is mockable only when it remains a descendant in the same replay context. Python thread dispatch requires Bitfab(trace_across_threads=True); Ruby child threads, pre-created consumers, and other processes are unmockable until the boundary moves into replay context. Python async generators are unmockable. A TypeScript synchronous selected span requires mock: "all" when freezing every matched child is acceptable; otherwise it is unmockable unless the existing boundary already returns a Promise. Set mockable: false plus the concrete reason for every exception. Auto framework spans are also mockable: false plus unmockableReason, except Vercel AI SDK model spans whose wrapLanguageModel middleware routes through withSpan and LangGraph `ToolNode` tool spans configured through the Experimental (alpha) `getLangGraphIntegration` / `get_langgraph_integration` replay boundary. Callback-only LangGraph tool spans remain unmockable. The root omits mockable because roots are never mocked. Mocking returns a span's recorded output instead of running the call, which only works through a replay wrapper; ordinary auto framework spans are observed, not wrapped. Authoritative per-framework lookup:
   **Python async-generator exception:** a manual async-generator @span is unmockable even though other manual spans are mockable. Set mockable: false with that reason, and move every unsafe operation inside it to a mockable sync or coroutine descendant before replay.
   - **LangGraph / LangChain**: model-call and tool / retriever / read / side-effect spans are observed via its callback handler, so they are NOT mockable; ToolNode tool spans configured through its Experimental (alpha) `getLangGraphIntegration` / `get_langgraph_integration` integration ARE mockable; callback-only tool spans remain NOT mockable.
   - **OpenAI Agents SDK**: model-call and tool / retriever / read / side-effect spans are observed via its tracing processor, so they are NOT mockable.
   - **Claude Agent SDK**: model-call and tool / retriever / read / side-effect spans are observed via its handler, so they are NOT mockable.
   - **BAML**: model-call spans are observed via its wrapper, so they are NOT mockable.
   - **Vercel AI SDK**: model-call spans run through `withSpan` via its middleware, so they ARE mockable (though re-run live by default).
   **Serializability, two facts separate from `mockable`:** set `outputSerializable: false` when the recorded OUTPUT doesn't serialize and `inputSerializable: false` when the recorded INPUT doesn't (an argument is a DB client, open stream, callback, or class instance with no JSON form); omit either when it serializes. The server forces any `outputSerializable: false` node unmockable, so **don't mock a node whose output isn't serializable**, and it flags the plan not replayable when the root's input isn't serializable, so **don't choose a root whose input isn't serializable** (promote the root to a caller taking the serializable request / prompt / messages). The hazard the mechanical `mockable` rule prevents: an `auto` `external_read` / `side_effect` (a framework tool hitting a DB / HTTP) left mockable promises a mock replay can't deliver; its real fix is a manual `withSpan` around that call or a db-snapshot, never a mock.

   **Include surrounding code as `pure` context nodes** so the modified capture is legible inside its codebase context and the user can toggle additional nodes into the capture directly in the UI without leaving the page. The test for inclusion is **"would the user plausibly want this as its own span?"**: anything they might wrap as a deeper child of what is already captured, or add as a peer at the same depth. Walk in two directions:
   - **~10 callees below each leaf**: candidates for **wrapping deeper spans**. For every existing leaf in the captured sub-tree, walk downward (callees of that leaf, callees of those, etc.) and attach each as a `pure` descendant. Include any callee the user might plausibly want as its own span, LLM / tool / agent calls, prompt construction, response parsing, retry loops, fan-outs, post-processing that drives another model. Stop at pure plumbing (pass-through returns, trivial formatting or arithmetic, no further interesting activity) or ~10 nodes per leaf. **Don't stop just because you crossed an SDK / framework / stdlib boundary**: the test is "is this plausibly its own span?", not "is this in our code?".
   - **~5 siblings per captured node BELOW the root**: candidates for **peer spans at the same depth**. For each captured node whose parent is the root or a descendant of it, include that parent's other callees (other functions invoked from the same wrapper) as `pure` siblings. These are the nodes the user might wrap alongside the existing capture to widen the trace sideways. **Don't generate siblings for the root**: a sibling of the root is by definition a child of the root's parent, which sits above the root and can never render. This removes nothing from under the root, the root's other callees still arrive as siblings of its captured children.
   - **Every context node MUST be a descendant of the root.** The plan tree renders downward from `rootId`, so a node above the root, or on a side branch hanging off one of those ancestors, is stored and counted but never drawn. Do not attach callers of the root, and do not attach the root's own siblings.

   Mark every surrounding node with `kind: "pure"` (uncaptured), **do not** add their ids to `capturedNodeIds`, and still attach `analysis` to each one. They serve two ends: **legibility** (the captured set sits inside its surrounding code so the user sees what is and isn't traced) and **modification** (they are the levers in the UI for expanding capture deeper).

   When applying a requested modification, read the relevant signatures so the plan stays accurate: for added context, name the exact keys/values and the span they attach to; for new instrumented spans, read each callee's signature and pick a type annotation (`function`, `llm`, `tool`, `agent`, `handoff`); for span removals, list each by name and confirm the underlying call is left untouched; for a new upstream/downstream root, read the new function's signature and confirm it still covers the interesting LLM/tool activity (upstream) or remains a common ancestor of every LLM/tool span (downstream).
5. **Post the modified plan, render it inline as ASCII, then use `AskUserQuestion` whether to review it in the browser or just continue**, same delivery pattern as Instrument's build-trace-plan step. The inline ASCII is what the user reviews in chat; Studio is the optional richer surface where they can adjust the captured set (selecting/deselecting any of the surrounding `pure` context nodes added in step 4). Continuing in chat, and every way of leaving the plan page in Studio (**Close**, **Save**, closing the window), applies the diff. None of them is an abort or a request for another round of plan edits.

   1. **Post the modified plan.** Do NOT open Studio here, rendering (step 2) and the browser-or-continue ask (step 3) come next. Which tool you call depends on whether step 3 found a prior plan:

      - **Prior plan id in hand (the normal path): call `mcp__plugin_bitfab_Bitfab__save_trace_plan`** with `{ planId, tree, capturedNodeIds }` (and `traceFunctionKey` only if the key is being renamed, `stats` if you have a sample run). This revises the EXISTING plan in place. **Always include `planId` here:** omitting it creates a second plan for the same key, which competes with the first. Sending `tree` + `capturedNodeIds` is a **structural** update, which reopens a confirmed plan to `awaiting`; that is expected and is why step 3 still has to confirm it.
        - **Always send the structural form here, even when only the capture set changed.** The targeted form (`capture` / `uncapture` / `mockOnReplayByNodeId`) deliberately leaves a confirmed plan `confirmed`, which breaks the rest of this step: `mcp__plugin_bitfab_Bitfab__confirm_trace_plan` then fails as "not awaiting", and Studio renders a confirmed plan read-only so the capture toggles this step offers are disabled. Reopening to `awaiting` is what makes the review and confirm below work. Use the targeted form only outside this flow, for a one-off adjustment with no review step.
      - **No prior plan (neither probe in step 3 found one, confirmed or awaiting): call `mcp__plugin_bitfab_Bitfab__save_trace_plan`** with `{ language, tree, capturedNodeIds, traceFunctionKey }` (and `stats` if you have one), exactly as Instrument does. Persisting the key lets the next Modify cycle bootstrap from this plan.

      In either save mode, `tree` is the modified `after` `TracePlanTree` from step 4, with the ~10 surrounding callees and ~5 sibling callees included as `pure` context nodes. Every node remains a descendant of `rootId`; never include callers above the root. Every node carries the `analysis` you set/carried-forward in that step, including uncaptured context nodes. `capturedNodeIds` is your initial recommendation and must form a connected sub-tree with exactly one entry point (selecting any descendant implies its ancestors); surrounding `pure` context nodes are not included. The server derives the validation card (status pill + aggregate counts) from the per-node `analysis`, so you don't send a summary. The tool returns the plan id (and a `https://bitfab.ai/studio/trace-plan/<id>` URL); for the update path that is the same id you already held.

   2. **Render the modified plan inline as ASCII** using the Default view template from the **Trace Plan Format** reference section (before/after framing: show the current capture and the modified capture, as fits the change). List the `Files changed:` footer (paths only, no annotations). This is what the user reviews in chat.

   3. **Then use `AskUserQuestion`** what they want to do next. The primary choice is **Open trace plan** (open Studio, the richer surface for reviewing and toggling the captured set) or **Continue** (apply the diff using the plan as rendered). The full option set and routing:

   > A) **Continue**: apply the diff using the plan shown above (or the set you confirmed in the browser) *(recommended)* → step 6
   > B) **Open trace plan**: open the plan in Studio to review and toggle the captured set; leaving that page (Close or Update) applies the diff → step 6
   > C) **Modifications**: change something about this plan → step 4
   > D) **Abort entirely**: discard this plan without writing any edits → the `setup-cleanup` skill
   > E) **Expand details**: re-render the inline ASCII diff in the expanded view → step 5

      - **Open trace plan**: run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openTracePlan.js" <planId>` (`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin directory; `<planId>` is the id from step 1) as a background / long-running process, never in the foreground. The script navigates Studio to the trace plan page and stays alive until the user leaves it, by clicking **Close** (keep the plan as drafted) or **Save** (save their toggles), or by closing the window. If it emits `{"event":"window-open-requested","url":"..."}`, immediately surface the URL in a normal chat message, e.g. `Opening Studio: <url>. Click it if a window doesn't appear`, before continuing to read. Tell the user in one line that the plan is open and that **Close** / **Save** there applies the diff, then use `AskUserQuestion`: a single yes/no question, **"Apply this now?"**, with **Continue** (branch **A**, recommended) and **Not yet** (keep reading the process, do not re-ask). Say in the question's own text that Close or Update in Studio applies it too and that the question stays up while they are over there, so returning and picking either option is safe. It is a confirm, not a fork; a change the user types as free text instead routes to branch **C**. Waiting is never an option, it is what the question on screen already does. **Read the background process's stdout before acting on their answer:** a terminal line that already landed means they acted in Studio and it wins (route on the event, never re-confirm over the toggles they saved with **Save**). Only when nothing has landed do you act on the answer, and the three answers act differently. **Continue** (branch **A**) closes the plan for them with `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio"` (navigates Studio off the plan page in place, never `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/closeStudio.js"`) and stops the background process first, because that branch finishes. **A typed change** (branch **C**) does neither: step 1 re-saves onto the same `planId`, and the open plan page re-renders itself when that update lands, so the user watches their plan change instead of losing the window, and the reader keeps waiting on the same plan. **Not yet** also does neither: leave Studio and the process alone and keep reading until it exits. A later "continue" typed in chat then takes branch **A**, teardown included: **the user must always be able to finish without touching Studio.** On branch **A**, if `mcp__plugin_bitfab_Bitfab__confirm_trace_plan` reports the plan is no longer awaiting, they saved in Studio between your read and your write: apply the set `mcp__plugin_bitfab_Bitfab__get_trace_plan` returns instead of your own. Otherwise parse the final JSONL line on exit: `{"event":"confirmed",...}` (Close or Update) and `{"event":"cancelled",...}` (window closed, or an expired plan released) both route to branch **A**, apply the diff; the one exception is a `"reason":"never-connected"` field, which means the window never opened, say so and offer to re-run. A non-zero exit (including the 30-minute timeout, which kills the reader but leaves the page usable) surfaces the error, then re-ask below. On `confirmed`, call `mcp__plugin_bitfab_Bitfab__get_trace_plan` with the returned `planId` (normally the one you opened, since a revision updates that plan in place; it differs only when something created a new plan mid-session, which `openTracePlan.js` auto-tracks via `tracePlan:created` events) to read the authoritative `capturedNodeIds` (the user may have toggled `pure` context nodes into the set or removed captured ones) and reconcile your edit plan with it (drop `●` wraps no longer captured, add wraps for newly captured nodes).
      - **Continue** (branch **A**): call `mcp__plugin_bitfab_Bitfab__confirm_trace_plan` with the plan id from step 1 and your recommended `capturedNodeIds` to persist the modified plan as *confirmed* (Studio's Close/Update does this on the browser path; every other path MUST do it here, or a later `/bitfab:setup view`/`/bitfab:setup modify` for this key won't find it), then apply the diff using the authoritative `capturedNodeIds` and per-node mock decisions it returns. If that call reports the plan is expired or no longer awaiting, apply the diff from the plan you rendered inline anyway and say in one line that it wasn't persisted. Every node should already be classified; if a captured node somehow lacks `analysis`, classify it now with the decision procedure from step 4 before instrumenting, never wrap a captured span without a mock decision.

   **If the save in step 1 itself errors** (e.g. offline or MCP unreachable, so there is no browser option): render the inline before/after ASCII from your in-memory tree, derive the mock decisions yourself, and **STOP**: use `AskUserQuestion` using the options above before writing edits. One error is not fatal in the same way: if `mcp__plugin_bitfab_Bitfab__save_trace_plan` reports the plan is **cancelled**, that plan is dead and cannot be revived, call `mcp__plugin_bitfab_Bitfab__save_trace_plan` again without `planId` to create a fresh plan and carry on.

   **Next:**

   - Option D (Abort entirely) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
6. **Apply the changes, purely additive to behavior.** Same rules as Instrument's write-instrumentation step: never change arguments, return values, error handling, variable names, types, control flow, or code structure. Removing a `withSpan`/`@span` wrapper is the only structural edit allowed, and only when it leaves the wrapped call, its arguments, and its return value untouched. The trace function key from step 2 stays the same, do not rename keys. Batch repetitive edits in parallel (one message, many Edit calls).
7. Tell the user how to run the app to generate a trace with the modified setup, exact command(s). Do NOT run it yourself. Then **MANDATORY STOP**: use `AskUserQuestion`:
   > We recommend **A**: generate a trace with the modified setup so the diff is observable end-to-end.

   > A) **Generate a trace for the modified setup**: present the script to run; allow the user to let you run it *(recommended)* → the `setup-cleanup` skill
   > B) **Modify another trace function**: pick another traced function to adjust → step 2
   > C) **Done**: stop here → the `setup-cleanup` skill

   B returns to step 2. A and C exit the Modify loop to cleanup (Modify does not auto-continue to Replay, the user can invoke `/bitfab:setup replay` separately).

   **Re-entry rule (applies after you leave this loop).** If, later in the conversation, the user asks to re-instrument or change another function's capture in plain language (`re-instrument <fn>`, `change what this span records`, `give me the updated trace plan for <fn>`), that is a fresh Modify (or Instrument) cycle: re-invoke `/bitfab:setup modify` (name the mode, so it goes straight to Modify rather than falling back to the full `wizard`) so it runs through the trace-plan flow. **Never satisfy such a request by hand-writing a trace plan or before/after diff you made up as a chat message, that skips the `mcp__plugin_bitfab_Bitfab__save_trace_plan` + inline ASCII render (and optional Studio review) this flow runs.**

   **Next:**

   - Option A (Generate a trace for the modified setup) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Done) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).

## Reference

These sections are consulted during the Instrument phase, not executed sequentially.

### Trace Plan Format

The trace plan is a strict format. Do not improvise, follow the legend, grammar, and template selection rule below. When in doubt, copy the matching canonical example verbatim and substitute names.

#### Legend

| Symbol | Meaning | Where it appears |
|---|---|---|
| `●` | Instrumented span | Default + Expanded + Processor views |
| `○` | Skipped function (not instrumented) | Only when the expand modifier is applied (on top of any base template) |
| `[root]` | Literal label for the trace function entry point | Always, on its own line above the tree |
| `[loop]` | Control-flow group: children execute in a loop | Inside the tree, in place of a span |
| `[branch]` | Control-flow group: children are conditional branches | Inside the tree, in place of a span |
| `[parallel]` | Control-flow group: children execute concurrently | Inside the tree, in place of a span |
| `[auto]` | Auto-captured by a trace processor, no manual instrumentation | Trace-processor view only |
| `(function)` `(llm)` `(tool)` `(agent)` `(handoff)` | Span type annotation | Immediately after every `●` span name |

Brackets `[…]` are structural labels (not spans). Parens `(…)` are span type annotations (only on `●` lines).

#### Grammar rules

1. **Header line**: exactly: `Trace function: "<trace-function-key>"` followed by one blank line.
2. **Root**: the next line is the literal `[root]`, with no symbol prefix.
3. **Tree body**: uses box-drawing characters only:
   - `├─` for every child except the last
   - `└─` for the last child
   - Children of a `├─` node indent with `│  ` (pipe + two spaces)
   - Children of a `└─` node indent with `   ` (three spaces, no pipe)
4. **Span lines**: `<prefix>● <name> (<type>)`. Type annotation is **required** on every `●` line.
5. **Skipped lines**: `<prefix>○ <name>`. No type annotation, no description.
6. **Control-flow lines**: `<prefix>[loop]` / `[branch]` / `[parallel]`. They take children but have no symbol and no type.
7. **Footer**: one blank line, then one or both of:
   - `Files changed:` followed by a numbered list, every file the cycle will touch. This always includes the replay registry module path for non-Go projects (`scripts/replayRegistry.ts`, `scripts/replay_registry.py`, or `scripts/replay_registry.rb`, new or edited per step 11b) alongside any instrumented source files. Go-only projects list only the instrumented source files.
   - `Setup: <one-line setup description>` (any plan that registers a trace processor)
   Hybrid plans (manual spans + processor) include both, with `Setup:` first then `Files changed:`. A pure-processor plan still lists `Files changed:` because the processor-registration file is edited and the replay registry module (non-Go) is written. Go-only pure-processor plans with a single registration file and no manual spans may include only `Setup:` plus that one file under `Files changed:`.
8. **No descriptions, no counts, no parameter details, no blank lines between siblings, no trailing whitespace.**
9. **One trace function per plan.** A trace plan describes exactly one trace function, exactly one `Trace function: "..."` header, exactly one `[root]`, exactly one tree, exactly one `Files changed:` section. If the cycle would require instrumenting two trace functions, that's two cycles, not one plan with two trees.

#### Which template to use (precedence, check top to bottom, stop at first match)

Pick the **base template** from SDK capability and surrounding work:

1. **Trace processor (hybrid) template**: if the SDK guide says to register a processor (e.g. OpenAI Agents SDK `addTraceProcessor`) AND there is meaningful work above, alongside, or below the SDK call. The trace function root wraps the broader workflow with manual `●` spans; the SDK call appears as one `(agent)` child whose grandchildren are the `[auto]` lines; other manual spans capture work outside the SDK. This is the default for any trace processor SDK whenever there's surrounding workflow logic, which is almost always. **The root must take the workflow's serializable input as its argument (the prompt / messages / request), because replay re-runs that root against its recorded input. A bare processor call (plain `run()`) with neither a root wrapper nor a manual root records a root span with no input (the agent span carries no recorded input) and is not replayable; the manual `withSpan`/`@span` root is what makes the broader trace replayable.**
2. **Trace processor (bare) template**: when the workflow truly is *just* the SDK call with no surrounding work. Use the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) in place of the plain run call: it records a keyed root carrying the run input, and the processor's auto-captured children nest underneath as `[auto]` lines, so the bare workflow is **replayable with no hand-written root**. **A plain `run()` under the processor alone records an empty-input root (the agent span carries no recorded input): observable but NOT replayable: only acceptable when the user has explicitly accepted an observable-only trace for this workflow.** Confirm before using this, if the workflow has any input prep, orchestration, retries, post-processing, or non-SDK LLM/tool calls, use the hybrid template instead.
3. **Default view**: every other case (no processor in play). This is the recommended default for SDKs without a processor.

Then apply the **expand modifier**, orthogonally:

- If the user explicitly asks for more detail ("show details", "expand", "include skipped") or selects "Expand details" from the AskUserQuestion preview, add `○` skipped lines to whichever base template was picked. Never drop `[auto]` lines when expanding a processor template, skipped lines and auto-captured lines coexist in the tree. Without an explicit ask, do not add skipped lines.

Never mix base templates beyond the hybrid pattern. Never invent a fifth variant.

#### Canonical examples (copy-edit-substitute, do not restructure)

**Default view**: instrumented spans only:

```
Trace function: "<trace-function-key>"

[root]
● outerFunction (function)
├─ ● llmCall (llm)
└─ [loop]
   ├─ ● anotherLlmCall (llm)
   └─ ● refinementCall (llm)

Files changed:
  1. client.ts
  2. pipeline.ts
```

**Default + expand modifier**: adds skipped (○) functions in true execution order. The same modifier applies to processor templates (hybrid or bare) when the user asks for expansion, `○` lines coexist with `[auto]` lines in that case:

```
Trace function: "<trace-function-key>"
● instrumented   ○ skipped

[root]
● outerFunction (function)
├─ ○ helperFormat
├─ ● llmCall (llm)
└─ [loop]
   ├─ ○ evaluateBatch
   ├─ ○ calculateScore
   ├─ ● anotherLlmCall (llm)
   ├─ ● refinementCall (llm)
   └─ ○ evaluateBatch

Files changed:
  1. client.ts
  2. pipeline.ts
```

The legend line `● instrumented   ○ skipped` appears **only** in the expanded view, immediately under the header.

**Trace-processor (hybrid) view**: workflow with manual spans wrapping auto-captured agent internals (default for processor SDKs):

```
Trace function: "handle-user-request"

[root]
● handleUserRequest (function)
├─ ● validateAndPrepareInput (function)
├─ ● runAgent (agent)
│  ├─ LLM calls    [auto]
│  ├─ tool calls   [auto]
│  └─ handoffs     [auto]
├─ ● scoreAgentOutput (llm)
└─ ● persistResult (function)

Setup: addTraceProcessor(processor) registered at startup
Files changed:
  1. handler.ts
  2. tracing/setup.ts
```

The `[auto]` lines are auto-captured spans, the processor emits them inside the SDK call without manual instrumentation. They use `├─`/`└─` like normal children but carry no `●`/`○` symbol because you're not writing the span yourself. Manual `●` spans wrap the broader workflow above, alongside, and below the SDK call.

**Trace-processor (bare) view**: only when the workflow IS just the SDK call:

```
Trace function: "my-agent"

[root]
● runAgent (function)
├─ LLM calls    [auto]
├─ tool calls   [auto]
└─ handoffs     [auto]

Setup: addTraceProcessor(processor) registered at startup
```

Use this **only** when there is genuinely no work above, alongside, or below the SDK call. If there's any input prep, orchestration, retry, post-processing, or non-SDK LLM/tool call, use the hybrid view instead.

#### Anti-examples (do NOT do these)

- ❌ `* outerFunction (function)`, use `●`, never `*` or `-` or `•`
- ❌ `● outerFunction`, type annotation is mandatory on every instrumented span
- ❌ `● outerFunction (function), calls the LLM with retries`, no descriptions, no em dashes
- ❌ `● outerFunction (llm-call)`, only the listed types are valid; do not invent new ones
- ❌ `[Root]` or `[ROOT]`, literal label is lowercase `[root]`
- ❌ Mixed indentation widths (2 spaces in one branch, 4 in another)
- ❌ Blank lines between siblings inside the tree
- ❌ Omitting `Files changed:` from any plan that has manual `●` spans (hybrid trace-processor plans MUST include both `Setup:` and `Files changed:`)
- ❌ Defaulting to the bare trace-processor view when the workflow has work above, alongside, or below the SDK call, use the hybrid view and add manual spans
- ❌ Putting the SDK's agent call (e.g. `runAgent`, `Runner.run`) at `[root]` when the actual workflow has a clear outer function, the workflow function is the root, the SDK call is a child
- ❌ Inventing extra sections like `Notes:` or `Estimated coverage:`
- ❌ Two `Trace function: "..."` headers in one plan, split into two cycles
- ❌ `● someFn (llm)   ← description here`, no inline descriptions, arrows, or trailing commentary on span lines
- ❌ `● <kind>DocumentCreate (llm)`, no placeholder/template span names; expand to concrete spans (e.g., three siblings, or under a `[branch]`)
- ❌ `Files changed` without the trailing colon
- ❌ `1. lib/bitfab.ts (new), Bitfab client + exported pipelines`, file entries are paths only, no annotations or descriptions
- ❌ Recommending an approach that requires "a tiny behavior change", disqualified at trace plan construction; restructure the tree instead

#### Presentation step

After building the plan and posting it with `mcp__plugin_bitfab_Bitfab__save_trace_plan`, render it inline as ASCII (rules above), then use `AskUserQuestion`:
- **View in browser** (recommended), open the plan in Studio to review and adjust the captured set
- **Continue**, accept the plan as rendered inline and proceed (no Studio round-trip)
- **Expand details**: re-render the ASCII using the expanded view template
- **Adjust**: user wants changes; ask what, then rebuild the tree and save it back onto the SAME plan with `mcp__plugin_bitfab_Bitfab__save_trace_plan` `{ planId, ... }`. Adjusting revises the plan the user is looking at; it never posts a second plan for the key.

### Trace Plan Accuracy

Read function signatures with the `Read` tool when the trace plan will reference their parameter names or return fields. Skipped leaf functions can be named from grep results if their shape isn't exposed in the plan. Never guess names that appear in the plan.
