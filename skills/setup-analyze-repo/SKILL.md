---
name: setup-analyze-repo
description: Analyze Repo phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "mcp__plugin_bitfab_Bitfab__get_bitfab_api_key", "mcp__plugin_bitfab_Bitfab__create_trace_plan", "mcp__plugin_bitfab_Bitfab__get_trace_plan", "Skill"]
---

# Bitfab Setup: Analyze Repo

**Run only when mode is `analyze-repo`.**

**This whole phase is non-interactive.** Never ask the user a question (never emit an `AskUserQuestion` call), never open Studio, never edit code, and never write a replay script. On this host `AskUserQuestion` is not even granted to the phase (it is excluded from `allowed-tools`), so a stray prompt is denied outright rather than hanging. Run it start to finish on your own and end with a printed report. The deliverable is a set of **draft trace plans** uploaded to Bitfab (unconfirmed) that the user can review and confirm later in Studio via `/bitfab:setup view` or the plan URLs. If anything blocks you (no auth, no valid candidates), stop and say so plainly rather than prompting.

1. **First, confirm authentication non-interactively.** Call `mcp__plugin_bitfab_Bitfab__get_bitfab_api_key` to retrieve the API key for the plugin's active org. If it returns a key, hold it and continue. If it errors or returns no key, **STOP the whole phase immediately**: this mode cannot run the interactive login (that needs a browser/Studio round-trip). Tell the user to run `/bitfab:setup login` first, then re-run `/bitfab:setup analyze-repo`. Do not prompt, do not retry, do not fall through to scanning.

   **Then detect the project language** (TypeScript, Python, Ruby, or Go). In a monorepo, identify which directories are **applications** (services, APIs, agents) vs **libraries** (SDKs, shared packages) and focus on the application directories. Scan imports and package manifests for supported framework signals, and note which framework each application directory uses:
   - **LangGraph / LangChain**: TS: `@langchain/langgraph`, `@langchain/core`; Python: `langgraph`, `langchain`, `langchain_core`
   - **OpenAI Agents SDK**: TS: `@openai/agents`, `setTraceProcessors`; Python: `agents` (`from agents import ...`)
   - **Claude Agent SDK**: TS: `@anthropic-ai/claude-agent-sdk`, `query(`; Python: `claude_agent_sdk`, `ClaudeSDKClient`, `query(`
   - **BAML**: TS: `@boundaryml/baml`, `baml_client` import; Python: `baml-py`, `from baml_client import b`
   - **Vercel AI SDK**: TS: `ai`, `wrapLanguageModel`, `streamText`, `generateText` (TypeScript only)
2. Read the codebase to identify **every** AI workflow, each place the app makes LLM calls, runs agents, or makes AI-driven decisions. In a monorepo, search each application directory separately (a root-level search misses subdirectories). For each workflow, find the **outer workflow boundary** (the function that builds any framework/stateful object, invokes it, and processes the output, e.g. an API handler, message processor, job runner, or pipeline coordinator, almost never the SDK's own `run()`/`invoke()` call), and note the meaningful work **above** it (auth, validation, input prep, retry/orchestration loops, multi-agent coordination), **alongside** it (custom LLM calls outside the SDK, unregistered tools, downstream services), and **below** it (post-processing, parsing, persistence). These become the manual spans around any auto-captured SDK content.

   **Record each candidate's replayability up front, because it drives selection in the next step.** A trace is replayable only if either (1) the boundary's inputs are serializable by the SDK's tracing layer, or (2) the workflow runs on a supported framework integration that records a replayable root (LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK). Flag boundaries whose natural inputs are **unserializable**: live SDK client instances passed as arguments (`OpenAI`/`Anthropic`/Bedrock clients, configured agents, DB connections, often smuggled inside an options/config bag), HTTP `Request`/`Response`, stream writers, open sockets, browser objects, or genuinely opaque request contexts. Module-scope or closure-captured dependencies do NOT count as unserializable inputs (replay inherits them from the loaded environment); only values passed **as arguments** do. Note, per candidate: the trace function boundary, its input shape and whether it is serializable, and the external state/side effects it touches (DB reads/writes, third-party APIs, queues, blob storage).
3. Rank the workflows found in step 2 by tracing value, most valuable first: prefer complex or LLM-heavy workflows, multi-step agents, and high-traffic production paths; deprioritize thin single-call wrappers and anything that only exists to test or explore locally (dev CLIs, notebooks).

   **Pick the top N**, where N is the plan cap for this run. Read N from the skill invocation arguments: if they include a `limit=<number>` token (e.g. `analyze-repo limit=3`), use that number; otherwise default to **5**. Pick fewer than N only if fewer valid candidates exist; pick more than N only if several are clearly tied for value and cheap to plan (never exceed N when it was explicitly passed).

   **Resolve serializability without prompting or editing code**, since this mode never refactors:
   - If the natural boundary's inputs are serializable, keep it as-is.
   - If they are unserializable but an obvious **inner** function with serializable inputs exists, move the boundary inward to that function (not a refactor, just a different, already-importable boundary).
   - If the workflow runs on a framework integration that records a replayable root (LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK), keep it and plan the handler/processor root.
   - If the only cleanly *replayable* boundary would require a **refactor** (extracting/exporting a new function, restructuring call sites), do NOT drop the candidate: plan a **coarser, purely-additive** boundary at the nearest existing function (a root-only span, or a framework handler root) even if its inputs aren't fully serializable, and note in the final report that it needs an interactive `/bitfab:setup instrument` pass to become cleanly replayable. Only **drop** a candidate when there is **no** additive boundary at all - nothing importable or wrappable without editing code. Aim to upload every one of the N selected; dropping should be rare.

   If **zero** valid candidates remain, skip to step 5 and say so.
4. For **each** candidate selected in step 3, build a `TracePlanTree` and upload it with `mcp__plugin_bitfab_Bitfab__create_trace_plan`. This is the same plan construction as an interactive Instrument cycle, **minus the browser confirmation**: do NOT run `openTracePlan.js`, do NOT open Studio, and do NOT run the "Presentation step" `AskUserQuestion` described in the Reference section (the phase is not granted that tool). Consult the **Trace Plan Format** and **Trace Plan Accuracy** rules in the Reference section below for span-type vocabulary and the tree grammar. Read each candidate's root signature (and any function whose parameter names or return fields the plan references) before building its tree; never guess names.

   Build each plan under the same hard constraint as Instrument: **the tree must describe purely-additive instrumentation.** If a shape would require a behavior change to nest correctly (awaiting a stream that wasn't awaited, reordering calls, blocking a callback), pick a flatter tree (siblings, or fewer captured nodes) instead. For callback-handler SDKs (LangGraph / LangChain, Claude Agent SDK, or Vercel AI SDK) use a handler-only or hybrid plan; for trace-processor SDKs default to a hybrid plan with a keyed root that carries the run input.

   For every candidate call `mcp__plugin_bitfab_Bitfab__create_trace_plan` with `{ language, tree, capturedNodeIds, traceFunctionKey, source: "analyze_repo" }`. **Always pass `source: "analyze_repo"`** here so these auto-drafted, unconfirmed plans are marked distinctly from interactively-confirmed ones (an interactive Instrument cycle omits `source`, which defaults to `interactive`):
   - Each `TraceNode` carries `id`, `name`, `kind` ("manual" | "auto" | "pure"), `file`, `line`, `signature`, `parentId`, `childIds`, plus `framework` for `[auto]` lines.
   - **Every captured node MUST include `sampleInput` and `sampleOutput`** (realistic values built from the function's parameter and return types, or the SDK's documented response shape); the plan is useless without them.
   - **Every captured node MUST include an `analysis`** (`{ classification, innerCall?, sideEffectKind?, readKind? }`), classified by the node's OWN body (Read it, don't guess from the name), excluding work already in captured children. First match wins: (1) it **is** the model call (an auto model leaf, or a model call inline in this body) → `model_call`; (2) its body mutates external state (DB write, outbound `POST/PUT/PATCH/DELETE`, queue, email, charge, file/vector write) → `side_effect` + `sideEffectKind`, wins over model_call; (3) its body reads external mutable state (DB `SELECT`, outbound `GET`, vector search, cache read) → `external_read` + `readKind`; (4) otherwise → `pure`. **Nested `model_call`s are always a bug**: the leaf that hits the API is the only model call; every wrapper above it (chain `.invoke`, graph node, your orchestrator) is `pure`. **The same no-bubbling rule applies to `side_effect` and `external_read`**: when a node's only write or read lives in a **captured child** (an orchestrator whose body just calls a captured `store.create` / `db.query` / model function), that node excluding the child is `pure` - do NOT bubble the child's `side_effect`/`external_read` up to it. A root or orchestrator is `side_effect` or `external_read` ONLY if its OWN body writes or reads external state outside every captured child; a root whose write/read is captured as a child span is `pure`. Do NOT send `mockOnReplay`/`suggestedFix`/summary; the server derives them.
   - Include surrounding code as `pure` context nodes (a few callers above the root, callees below each leaf, siblings at each captured node's depth) so the plan is legible and expandable in the UI. These are NOT in `capturedNodeIds`.
   - `capturedNodeIds` is your recommended capture set and must form a connected sub-tree (selecting a descendant implies its ancestors). `traceFunctionKey` is the key a future Instrument/Modify cycle would wire up.

   `mcp__plugin_bitfab_Bitfab__create_trace_plan` returns a plan id and a `https://bitfab.ai/studio/trace-plan/<id>` URL. **Collect the id, URL, trace function key, and boundary `file:line` for each candidate.** Process candidates independently: if one fails to build or upload, record the failure and continue with the rest, do not abort the batch. You may optionally read a plan back with `mcp__plugin_bitfab_Bitfab__get_trace_plan` to confirm it persisted.
5. Print one plain-markdown summary (no `AskUserQuestion`; the phase is not granted that tool). Lead with a one-line count ("Uploaded N draft trace plans"), then a table or list with one row per uploaded plan: **trace function key**, **boundary** (`file:line`), a one-line **why it's worth tracing**, and the **plan URL** (`https://bitfab.ai/studio/trace-plan/<id>`). After the list, note explicitly that:
   - these are **draft (unconfirmed) plans**: nothing was instrumented and **no code was changed**;
   - the user can review and confirm each in Studio (open a plan URL directly, or run `/bitfab:setup view` for a function), then run `/bitfab:setup instrument` to write the instrumentation and replay pipeline;
   - any plans you uploaded at a **coarser boundary** because the cleanly-replayable one would need a refactor (per step 3): call these out with a one-line note that they need an interactive `/bitfab:setup instrument` pass to become cleanly replayable;
   - any candidates you **dropped** (no additive boundary at all, nothing wrappable without editing code) or that **failed to upload**, with a one-line reason each, so the user can follow up interactively.

   If preflight found no auth, or selection found zero valid candidates, this report is just that single explanatory message.

   **Next:**

   - Mode `analyze-repo`: invoke the `setup-cleanup` skill with mode `analyze-repo`.

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
