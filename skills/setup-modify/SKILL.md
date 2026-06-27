---
name: setup-modify
description: Modify phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__create_trace_plan", "mcp__plugin_bitfab_Bitfab__get_trace_plan", "Skill"]
---

# Bitfab Setup: Modify

**Mode:** you were dispatched with a mode (`wizard` or `instrument` or `modify`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `instrument` or `modify`.**

Adjust an **existing** trace setup. Requires existing SDK usage in the codebase, if none exists, run Instrument first. Triggered explicitly by `/bitfab:setup modify`, or selected from the AskUserQuestion at Instrument's existing-SDK-usage menu when existing SDK usage is found.

Every Modify cycle targets **exactly one** trace function. Never batch multiple trace functions in one cycle, if the user wants more, loop via the step 7 menu.

1. **Gather existing trace functions** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). List each key alongside its root function (or, for keys registered only via a framework handler, the handler registration site, handler keys have no decorated root and that is expected). If none are found, tell the user Modify needs existing instrumentation and suggest `/bitfab:setup instrument`.

   **Next:**

   - No instrumented trace functions exist (nothing to modify) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`).
2. **Pick exactly ONE trace function to modify.** Use `AskUserQuestion` with the list of existing keys. Recommend the one the user most recently instrumented (or the one most recently referenced in the current session) and explain why in one line.
3. **Bootstrap the `before` `TracePlanTree` from the most recent confirmed trace plan for this trace function key**, falling back to reading the code only when no prior plan exists. The plan from the previous Instrument or Modify cycle is the source of truth for what's currently captured, re-deriving from code drops sample inputs/outputs and surrounding-context nodes the user previously confirmed.

   1. Call `mcp__plugin_bitfab_Bitfab__get_trace_plan` with `{ traceFunctionKey: "<chosen key>" }` (no `planId`). Two outcomes:
      - **Prior plan found**: parse the JSON block in the response. Use its `tree` as the `before` `TracePlanTree` and its `capturedNodeIds` as the current capture set. You do not need to re-read the instrumented files. Skip step 2.
      - **"No prior confirmed trace plan found"**: there is no plan for this key yet (key created outside the skill, or first Modify cycle that predates this column). Fall through to step 2.
   2. **Code-reading fallback.** Read the instrumented files to map the existing span tree into a `TracePlanTree` (`{ rootId, nodes: { [id]: TraceNode } }`, same shape used in Instrument's build-trace-plan step). Each `TraceNode` carries `id`, `name`, `kind` ("manual" | "auto" | "pure"), `file`, `line`, `signature`, `parentId`, `childIds`, plus `framework` for `[auto]` lines.

   Either way, hold the `before` tree in memory, it seeds the `after` tree you build in step 4 and becomes the left-hand side of the inline-fallback diff in step 5. Do not present it yet.
4. **Build the modified trace plan as a `TracePlanTree` under the same PURELY ADDITIVE constraint as Instrument's build-trace-plan step.** Start from the `before` tree built in step 3 and produce an `after` tree of the same shape (`{ rootId, nodes: { [id]: TraceNode } }`) that applies the user's requested modifications. Reuse node ids unchanged for nodes that survive, that lets the trace plan UI show only what actually changes, and mint new ids for added nodes.

   **If the user didn't request anything specific** (no modifications were named in the skill invocation or earlier in the conversation), produce an `after` tree identical to the `before` tree. Don't invent changes. The user will edit the capture set directly in the UI in step 5.

   The modified tree must be implementable without behavior changes. If a requested modification requires awaiting a stream that wasn't awaited, delaying a call, reordering operations, blocking a callback, or restructuring control flow, tell the user which part doesn't fit and why, and ask them to refine the request (or suggest splitting into multiple cycles). Never present a behavior-changing approach as an option.

   **Every captured node MUST include `sampleInput` and `sampleOutput`**: same hard rule as Instrument's build-trace-plan step. Carry samples forward unchanged for surviving nodes; for newly added nodes (intermediate spans, deeper leaves, a new upstream/downstream root), construct realistic example values from the function's parameter and return types (Read the file and its return-type imports if needed). Do not advance to step 5 with a captured node missing either field.

   **Include surrounding code as `pure` context nodes** so the modified capture is legible inside its codebase context and the user can toggle additional nodes into the capture directly in the UI without leaving the page. The test for inclusion is **"would the user plausibly want this as its own span?"**: anything they might promote to a wider root, wrap as a deeper child, or add as a peer at the same depth. Walk in three directions:
   - **~10 callers above the root**: candidates for **promoting the root upward** to a wider scope. Walk via Grep (callers of the root, then callers of those, etc.) and attach each as a `pure` ancestor. Stop at process entry points (HTTP handlers, queue workers, CLI `main`, cron jobs, page handlers, framework boot, there is no useful root above those) or when you've gathered ~10 nodes.
   - **~10 callees below each leaf**: candidates for **wrapping deeper spans**. For every existing leaf in the captured sub-tree, walk downward (callees of that leaf, callees of those, etc.) and attach each as a `pure` descendant. Include any callee the user might plausibly want as its own span, LLM / tool / agent calls, prompt construction, response parsing, retry loops, fan-outs, post-processing that drives another model. Stop at pure plumbing (pass-through returns, trivial formatting or arithmetic, no further interesting activity) or ~10 nodes per leaf. **Don't stop just because you crossed an SDK / framework / stdlib boundary**: the test is "is this plausibly its own span?", not "is this in our code?".
   - **~5 siblings per captured non-root node**: candidates for **peer spans at the same depth**. For each captured non-root node, include the parent's other callees (other functions invoked from the same wrapper) as `pure` siblings. These are the nodes the user might wrap alongside the existing capture to widen the trace sideways.

   Mark every surrounding node with `kind: "pure"` (uncaptured) and **do not** add their ids to `capturedNodeIds`. They serve two ends: **legibility** (the captured set sits inside its surrounding code so the user sees what is and isn't traced) and **modification** (they are the levers in the UI for expanding capture deeper, broader, or sideways).

   When applying a requested modification, read the relevant signatures so the plan stays accurate: for added context, name the exact keys/values and the span they attach to; for new instrumented spans, read each callee's signature and pick a type annotation (`function`, `llm`, `tool`, `agent`, `handoff`); for span removals, list each by name and confirm the underlying call is left untouched; for a new upstream/downstream root, read the new function's signature and confirm it still covers the interesting LLM/tool activity (upstream) or remains a common ancestor of every LLM/tool span (downstream).
5. **Send the modified plan straight to the trace plan UI, it is the user's primary surface for confirming or editing the change**, not the inline before/after diff. The user can adjust the captured set directly in the UI (selecting/deselecting any of the surrounding `pure` context nodes added in step 4). Confirm in the UI = apply the diff. Cancel = ask the user what they want to change. Same delivery pattern as Instrument's build-trace-plan step.

   1. **Post the modified plan and open the UI.** Call `mcp__plugin_bitfab_Bitfab__create_trace_plan` with `{ language, tree, capturedNodeIds, traceFunctionKey }` (and `stats` if you have a sample run from the existing trace function):
      - `tree`, the modified `after` `TracePlanTree` from step 4, with the ~10 surrounding callers / ~10 surrounding callees included as `pure` context nodes.
      - `capturedNodeIds`, your initial recommendation. Must form a connected sub-tree (selecting any descendant implies its ancestors). Surrounding `pure` context nodes are not included.
      - `traceFunctionKey`, the existing key from step 2. Persisting it lets the next Modify cycle bootstrap from this plan.

      The tool returns a plan id (and a `https://bitfab.ai/studio/trace-plan/<id>` URL).

   2. **Open the trace plan in the browser** by running:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openTracePlan.js" <planId>
   ```

   (`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin directory; `<planId>` is the id returned by `mcp__plugin_bitfab_Bitfab__create_trace_plan`.) The script navigates Studio to the trace plan page and **blocks** until the user clicks **Confirm** or **Cancel**.

   3. **On exit, parse the final JSONL line and route:**
      - `{"event":"confirmed","planId":"<uuid>"}`, call `mcp__plugin_bitfab_Bitfab__get_trace_plan` with the returned `planId` (which may differ from the original if a mid-session `create_trace_plan` created a new plan; `openTracePlan.js` auto-tracks the latest plan via `tracePlan:created` events) to read the authoritative `capturedNodeIds` (the user may have toggled `pure` context nodes into the captured set or removed previously-captured nodes in the UI). Reconcile your edit plan with what's now in `capturedNodeIds`, drop manual `●` wraps no longer captured, add wraps for any newly captured nodes, then take branch **A** (Proceed).
      - `{"event":"cancelled","planId":"<uuid>"}`, the user cancelled from the browser. Take branch **C** (Modifications), use `AskUserQuestion`: what do they want to change? Their answer feeds back into step 4. When the loop re-runs `openTracePlan.js` with the new plan, the script reuses the existing Studio browser tab automatically.
      - non-zero exit (including `{"event":"timeout",...}`), surface the error to the user, then fall back to the inline AskUserQuestion below.

   **Inline fallback** (use only if `mcp__plugin_bitfab_Bitfab__create_trace_plan` errors, e.g. offline or MCP unreachable, or `openTracePlan.js` exits non-zero): present an inline before/after diff using the Default view template from the **Trace Plan Format** reference section, list `Files changed:` (paths only, no annotations), and **STOP**: use `AskUserQuestion`:

   > A) **Proceed**: apply the diff using the confirmed capture set *(recommended)* → step 6
   > B) **Expand details**: re-render the inline diff in the expanded view (fallback only) → step 5
   > C) **Modifications**: ask what the user wants to change, then return to building the modified plan → step 4
   > D) **Abort entirely**: drop this cycle without writing edits → the `setup-cleanup` skill

   **Next:**

   - Option D (Abort entirely) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`).
6. **Apply the changes, purely additive to behavior.** Same rules as Instrument's write-instrumentation step: never change arguments, return values, error handling, variable names, types, control flow, or code structure. Removing a `withSpan`/`@span` wrapper is the only structural edit allowed, and only when it leaves the wrapped call, its arguments, and its return value untouched. The trace function key from step 2 stays the same, do not rename keys. Batch repetitive edits in parallel (one message, many Edit calls).
7. Tell the user how to run the app to generate a trace with the modified setup, exact command(s). Do NOT run it yourself. Then **MANDATORY STOP**: use `AskUserQuestion`:
   > We recommend **A**: generate a trace with the modified setup so the diff is observable end-to-end.

   > A) **Generate a trace for the modified setup**: present the script to run; allow the user to let you run it *(recommended)* → the `setup-cleanup` skill
   > B) **Modify another trace function**: returns to step 2 → step 2
   > C) **Done**: stop here → the `setup-cleanup` skill

   B returns to step 2. A and C exit the Modify loop to cleanup (Modify does not auto-continue to Replay, the user can invoke `/bitfab:setup replay` separately).

   **Next:**

   - Option A (Generate a trace for the modified setup) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`).
   - Option C (Done) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`).

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
   - `Files changed:` followed by a numbered list, every file the cycle will touch. This always includes the replay script path for non-Go projects (`scripts/replay.*` new or edited, per step 11b) alongside any instrumented source files. Go-only projects list only the instrumented source files.
   - `Setup: <one-line setup description>` (any plan that registers a trace processor)
   Hybrid plans (manual spans + processor) include both, with `Setup:` first then `Files changed:`. A pure-processor plan still lists `Files changed:` because the processor-registration file is edited and the replay script (non-Go) is written. Go-only pure-processor plans with a single registration file and no manual spans may include only `Setup:` plus that one file under `Files changed:`.
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

After building the plan according to the rules above, use `AskUserQuestion` with these three options:
- **Proceed** (recommended), accept the default view as shown
- **Expand details**: re-render using the expanded view template
- **Adjust**: user wants changes; ask what

### Trace Plan Accuracy

Read function signatures with the `Read` tool when the trace plan will reference their parameter names or return fields. Skipped leaf functions can be named from grep results if their shape isn't exposed in the plan. Never guess names that appear in the plan.
