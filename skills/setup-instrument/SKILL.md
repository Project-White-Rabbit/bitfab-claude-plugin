---
name: setup-instrument
description: Instrument phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "WebFetch", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__get_bitfab_api_key", "mcp__plugin_bitfab_Bitfab__create_trace_plan", "mcp__plugin_bitfab_Bitfab__get_trace_plan", "Skill"]
---

# Bitfab Setup: Instrument

**Mode:** you were dispatched with a mode (`wizard` or `instrument`); the gates and Next routing below depend on it.

**Run only when mode is `wizard` or `instrument`.**

Instrument the codebase with Bitfab tracing. Requires authentication (run Login first if needed).

Bitfab captures every AI function call, inputs, outputs, and errors, so you can see exactly what your AI is doing and discover what's going wrong. The goal is to have enough context in each trace to tell whether a call succeeded or failed, and why.

**Detection and search below are mechanical: run the probes and report what you found, without narrating each command. Combine related read-only checks into one command (separate them with `;`, not `&&`, since a no-match `grep` exits non-zero and would abort an `&&` chain) and read multiple files in a single batch; adaptive follow-up greps that depend on a prior result are expected. A risk, ambiguity, or unexpected finding (unserializable inputs, a shim with lazy init, an ambiguous root) is never the narration to suppress: raise it immediately, even mid-probe.**

1. **Detect the project language** (TypeScript, Python, Ruby, or Go). In a monorepo, identify which directories are **applications** (services, APIs, agents) vs **libraries** (SDKs, shared packages). Focus on application directories. Also scan imports and package manifests for supported framework signals, and note which framework each application directory uses, step 5 fetches the matching framework page alongside the language reference:
   - **LangGraph / LangChain**: TS: `@langchain/langgraph`, `@langchain/core`; Python: `langgraph`, `langchain`, `langchain_core`
   - **OpenAI Agents SDK**: TS: `@openai/agents`, `setTraceProcessors`; Python: `agents` (`from agents import ...`)
   - **Claude Agent SDK**: TS: `@anthropic-ai/claude-agent-sdk`, `query(`; Python: `claude_agent_sdk`, `ClaudeSDKClient`, `query(`
   - **BAML**: TS: `@boundaryml/baml`, `baml_client` import; Python: `baml-py`, `from baml_client import b`
   - **Vercel AI SDK**: TS: `ai`, `wrapLanguageModel`, `streamText`, `generateText` (TypeScript only)
2. **Search for existing SDK usage** (`withSpan`, `@span`, `bitfab_span`, `client.Span`, `getFunction`, `get_function`, etc.). In a monorepo, search **each application directory separately**: a root-level search can miss subdirectories.
   - If found: list the trace function keys, then use `AskUserQuestion`:

   > A) **Search for more workflows**: find uninstrumented gaps *(recommended)* → step 3
   > B) **Modify an existing trace setup**: jump to the Modify phase → the `setup-modify` skill
   > C) **Continue**: done instrumenting → the `setup-replay` skill (mode `wizard`); otherwise the `setup-cleanup` skill

     If "Modify", jump to the Modify phase. If "Continue", follow the option's destination: Replay in `wizard` mode, Cleanup otherwise.
   - **If usage routes through a project-local shim** (a wrapper file that re-exports `withSpan` / `@span` / `bitfab_span` / `getCurrentTrace` / `getCurrentSpan` with custom init, often named `lib/bitfab.*` or after a predecessor SDK such as `lib/simforge.*`), audit the shim before instrumenting anything new. The shim must (a) construct the SDK client (`new Bitfab(...)`, `bitfab_init()`, `Bitfab::Client.new`, etc.) at module load, **synchronously**, never lazily inside the wrapped function; and (b) hand off to the SDK call synchronously, with no `await` between the user's entry to the shim and `client.withSpan(...)` / `@bitfab.span(...)`. Lazy or async client init (e.g. `await getOrCreateTraceFunction(key)` inside the wrapped body) breaks the SDK's nesting context (TypeScript `AsyncLocalStorage`, Python `contextvars`) under any parallel fan-out (`Promise.all`, `Promise.allSettled`, `asyncio.gather`, parallel workers): every span becomes its own top-level trace instead of nesting inside its caller. Fix the shim before instrumenting anything new. (Direct callers of the SDK with no shim already satisfy this rule, skip the audit.)
   - If not found: **proceed to step 3**: no SDK usage does NOT mean nothing to instrument, it means the SDK hasn't been installed yet. NEVER conclude "nothing to instrument" before completing step 6.

   **Next:**

   - Option B (Modify an existing trace setup) (mode `wizard` or `instrument`): invoke the `setup-modify` skill with the current mode (`wizard` or `instrument`).
   - Option C (Continue) (mode `wizard`): invoke the `setup-replay` skill with mode `wizard`.
   - Option C (Continue) (mode `instrument`): invoke the `setup-cleanup` skill with mode `instrument`.
3. Use the API key from the Login phase (or retrieve it now if already authenticated)
4. **Install the SDK now.** Detect the project's package manager from its manifest (`pyproject.toml` → `uv`/`poetry`; `package.json` → `pnpm`/`npm`/`yarn`/`bun`; `Gemfile` → `bundle`; `go.mod` → `go get`; `requirements.txt` → edit file + `pip install -r`) and run its canonical add command, do NOT stop to ask about version pinning or dep groups. Prefer `uv add`/`poetry add` over bare `pip install` (bare `pip install` doesn't persist to pyproject.toml). In monorepos, scope to the correct workspace (e.g. `pnpm add --filter <pkg>`, or cd into the app directory first), running from the repo root will install into the wrong package. Default to a runtime dep for applications; a dev dep for libraries/SDKs where a runtime dep would propagate to downstream users. Then set the `BITFAB_API_KEY` environment variable.

   **Tell the user what you did.** Pick the env-handling approach that fits the project's existing convention. Whatever you do, surface it explicitly: name the file (with absolute path) or mechanism you used, so the user knows where the key now lives. Do not print the key value itself. If the key landed in a `.env`-style file, additionally tell the user that any already-running dev server, REPL, or test runner may need a restart to pick it up, since most file watchers reload code on save but not env files.
5. **Read the SDK reference.** Fetch the dense canonical reference page first (`/reference/typescript.md`, `/reference/python.md`, `/reference/ruby.md`, or `/reference/go.md`) for every signature, type, default, and error semantic you need (initialization, `withSpan` / `@span` / `bitfab_span` / `client.Span`, `getFunction` / `get_function` / `GetFunction` / `bitfab_function`, `SpanType`, `getCurrentSpan`/`getCurrentTrace`, `wrapBAML`/`wrap_baml`). If step 1 detected a framework in this application directory, also fetch the matching framework page; it documents the handler/processor/wrapper the SDK exposes for that framework, which is usually preferable to hand-wrapping every node/agent call with `withSpan`/`@span`: LangGraph / LangChain → `/frameworks/langgraph.md` (`getLangGraphCallbackHandler` / `get_langgraph_callback_handler`; in a LangChain-only project, prefer the identical aliases `getLangChainCallbackHandler` / `get_langchain_callback_handler` so the code reads naturally); OpenAI Agents SDK → `/frameworks/openai-agents.md` (`getOpenAiTracingProcessor` / `get_openai_tracing_processor`, plus the replayable run wrapper `getOpenAiAgentHandler` / `get_openai_agent_handler` (drop-in for the run call)); Claude Agent SDK → `/frameworks/claude-agent-sdk.md` (`getClaudeAgentHandler` / `get_claude_agent_handler`); BAML → `/frameworks/baml.md` (`wrapBAML` / `wrap_baml`); Vercel AI SDK → `/frameworks/vercel-ai-sdk.md` (`getVercelAiMiddleware`). Then fetch the language guide (`/typescript-sdk.md`, `/python-sdk.md`, `/ruby-sdk.md`, `/go-sdk.md`), including the Replay section for non-Go projects, for the install command, the multi-file project layout example, the BAML auto-instrumentation walkthrough, and the replay script template. Read the replay section upfront (not later) because step 13 reuses it to write the replay pipeline in the same cycle, and it should not re-fetch these pages. Fetch all of these as parallel WebFetch calls in a single message (they are independent URLs, so do not fetch them one at a time), or ask the user to share the pages. **Do not improvise instrumentation from memory**: the API has moved and guessing will produce broken code.
6. **Instrumentation must produce a replayable trace. There are exactly two ways to get one: (1) the root span has serializable inputs, or (2) the workflow runs on a supported framework integration that records a replayable root (LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK), which captures the framework's own serializable input as the root. Establish one of these before writing any instrumentation. Trace-processor integrations (OpenAI Agents SDK) are a special case: the processor auto-captures the agent run, but on its own records a root span with an empty input (verified against a live run: the OpenAI Agents agent span is the root and carries no recorded input), so the processor ALONE is NOT replayable. Pair it with its run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) — a drop-in for the run call that opens a keyed root carrying the run input as a serializable argument, with the processor's spans nesting underneath, which turns it into case (1). A hand-written `withSpan`/`@span` root that takes the run input works too.**

   **The root exists so the replay harness can re-invoke it as a plain lambda with serialized inputs**: that's what makes traces searchable (a coherent unit of behavior) and replayable (runnable against current code). The root must own its state setup, not consume a pre-built stateful object the replay script can't reconstruct. Frameworks are the sharpest case (LangGraph compiled graphs, Claude Agent SDK clients, LangChain chains all require constructors + special setup), but the rule generalizes to anything stateful, configured SDK clients, prepared models, cached routers, DB sessions. The root is therefore the outer workflow function that **builds** the framework / stateful object + invokes it + processes the output (API handler, message processor, job runner, pipeline coordinator), almost never the SDK's `run()` / `invoke()` itself.

   **Hard constraint: every wrapped function's inputs and outputs must be serializable by the SDK's tracing layer so traces can be replayed.** Every span input and output gets serialized into the trace using the SDK's language-native serialization (TypeScript/JSON, Python/JSON via Pydantic, Ruby/`to_json`, Go/`json.Marshal`). If a wrapped function takes live runtime objects that don't round-trip through that serialization, the trace can't be replayed, and badly-failing inputs can drop the entire span on the floor (not just garble the input field). Examples of unserializable inputs:
   - browser objects (`MediaStream`, `RTCPeerConnection`, `WebSocket`, DOM refs)
   - HTTP `Request` / `Response`, stream writers, open sockets
   - framework request contexts whose content is genuinely opaque (not reconstructible from headers + user id)
   - **live SDK client instances passed as arguments** (LLM clients like `OpenAI` / `Anthropic` / Bedrock, configured agents, DB connection objects, HTTP agents): class instances whose internals carry circular references, function members, or platform handles all sink superjson and `JSON.stringify`. Watch especially for an options/config bag (e.g. `options.llmProvider`, `ctx.db`) that smuggles a live client into an otherwise-serializable signature.

   **Unserializable OUTPUTS (live streams) are a separate case from unserializable inputs, and in the TypeScript SDK they do NOT require a refactor.** A function whose inputs are serializable but which returns a live stream the caller consumes directly (a Vercel AI SDK `streamText` result, a `ReadableStream`, an SSE / streaming `Response`) is the common shape for chat and agent endpoints. Serializing that object as-is captures nothing replayable, and awaiting it to completion before returning would break streaming and first-byte latency. Record a drained, serializable view of the stream as the span output instead:
   - **TypeScript: use the `withSpan` `finalize` option** (`withSpan(key, { type, finalize }, fn)`). The wrapped function returns the live stream to the caller unchanged; the span records `await finalize(result)` (e.g. `{ text, usage, toolCalls }`). Pass the prebuilt `finalizers.aiSdk` for the Vercel AI SDK, or `finalizers.readableStream` for a raw `ReadableStream` (reading the AI SDK result's promises does not disturb the caller's stream, since it tees internally). This is **purely-additive instrumentation, NOT a refactor**: do it in the write-instrumentation step with no second confirmation. The trace stays replayable as long as the function's *inputs* are serializable. Never push the user into a structural rewrite of a streaming endpoint when `finalize` covers it.
   - **Python: also use the `finalize` option** (`@client.span(key, type=..., finalize=...)`). The idiomatic, non-destructive shape is an **async generator** that `yield`s its chunks (the caller still receives every chunk); `finalize` then receives the collected chunks and returns a serializable summary. Pass `finalizers.openai_chunks` for OpenAI streaming or `finalizers.anthropic_events` for Anthropic. Same rule: **purely-additive, NOT a refactor**, no second confirmation. (Python streams are single-consumer, so prefer the async-generator form over draining a returned stream object.)
   - **Ruby / Go (no `finalize` yet): introduce a serializable completion.** Trace a core that runs the turn to completion and returns `{ text, usage, ... }`, with the streaming wired around it (the structural refactor below).

   Module-level dependencies (DB clients, env vars, config loaders, LLM clients) do **not** count *when accessed via module scope or closure*: replay inherits them from the app's loaded environment. The same client passed *as a function argument* IS captured as input and WILL fail. The fix when an SDK client is the only unserializable piece is usually trivial: hoist it to module scope (or capture via closure) and drop it from the argument list, leaving the wrapped function's serializable args (issue, request, options-without-the-client) intact. When the natural outer boundary still has unserializable inputs after that, do **one** of the following **before writing code**:
   - **Instrument via the framework handler or processor** (preferred whenever the workflow runs on a supported framework: LangGraph / LangChain via `getLangGraphCallbackHandler` / `get_langgraph_callback_handler`, OpenAI Agents SDK via `getOpenAiTracingProcessor` / `get_openai_tracing_processor`, Claude Agent SDK via `getClaudeAgentHandler` / `get_claude_agent_handler`, Vercel AI SDK via `getVercelAiMiddleware`). These split into two replayability cases, do not conflate them:
     - **Integrations that record a replayable root (LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK) are replayable as-is**, via one of two mechanisms. **Callback handlers** (LangGraph / LangChain, Claude Agent SDK, or Vercel AI SDK) record the framework invocation itself as the root span, with the framework's own serializable input (LangGraph initial state, agent prompt) as the recorded root input. **Trace processors** (OpenAI Agents SDK) don't record the input themselves, so their run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) does it: a drop-in for the run call that records a keyed root carrying the run input, with the processor's auto-captured spans nesting underneath. Either way, the unserializable arguments above it (live dependency objects, billing callbacks, request contexts) never enter the trace, and no decorated root function needs to exist in the app code: the replay script passes the key to `replay()` with a plain callable that re-invokes the framework entrypoint with the recorded root input plus a freshly constructed environment (framework config, dependencies, safe no-op substitutes for side-effectful wiring); the SDK wraps the callable internally. On SDKs that predate explicit-key replay, wrap the callable under the same key yourself (Python `@bitfab.span("<key>")`, TS `getFunction(key).withSpan(...)`). The pattern is documented in the SDK docs' Replay section (handler subsection) and wired up in step 13 11b. Never report one of these workflows as "not replayable" because no `@span`-decorated function exists in production code.
     - **A bare trace processor (OpenAI Agents SDK) with neither its run wrapper nor a manual root is NOT replayable.** The processor captures the run, but its root span records an empty input (verified against a live run: the OpenAI Agents agent span is the root and carries no recorded input). Pair it with the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) — the drop-in for the run call above — or a hand-written `withSpan`/`@span` root that takes the run input: the processor's auto-captured spans nest under that root, and replay runs against the root's serializable input. Do not treat a bare processor-only trace as replayable.
   - **Move the trace boundary inward** to the first function whose inputs are serializable (e.g. trace `processTurn(transcript, context)` instead of `handleSession(stream, peerConnection)`). This is not a refactor.
   - **Refactor** so a function with serializable inputs exists. Two flavors, chosen per case in the refactor plan:
     - **Visibility refactor (common)**: the logic that takes serializable inputs already exists inline but isn't importable (embedded in a route handler, not exported). Extract it into a named, exported function at module scope. No semantic change.
     - **Structural refactor (rare overall, mostly realtime/browser apps)**: no function with serializable inputs exists yet. Introduce one: a pure core whose parameters are serializable, with callers constructing them. A real rewrite. (This flavor is for missing serializable-*input* cores. A streaming *output* in the TypeScript and Python SDKs is handled by the `finalize` option above, not a structural refactor; only fall back here for streaming on Ruby/Go.)

   Raise this with the user in step 10 (not later); never instrument a root with unserializable inputs and try to fix it in the Replay phase.
7. Before reading any code to find workflows, use `AskUserQuestion` how they'd like to find what to instrument first:

   > A) **Find workflows for me**: scan the codebase for every AI call, agent, and LLM-driven decision *(recommended)* → step 8
   > B) **Instrument a specific target**: name the file, function, or directory to instrument → step 9

   If they pick **A**, do the full codebase scan in step 8. If they pick **B**, ask which file, function, or directory they want to instrument (if they haven't already named it) and go to step 9 to read just that location, skipping the broad scan.
8. Read the codebase to identify ALL AI workflows, every place the app makes LLM calls, runs agents, or makes AI-driven decisions. For each, find the **outer workflow boundary** (per the rule in step 6), and also note any meaningful work **above** the agent/LLM call (auth, validation, input prep, retry/orchestration loops, multi-agent coordination), **alongside** it (custom LLM calls outside the SDK, tools that aren't registered with the SDK, downstream services), and **below** it (post-processing, parsing, persistence). These are the manual spans that will sit around any auto-captured SDK content.
9. The user named a specific file, function, or directory to instrument. Read just that location and its immediate surroundings, do NOT scan the rest of the codebase. Find the **outer workflow boundary** there (per the rule in step 6), and note the meaningful work **above** the agent/LLM call (auth, validation, input prep, retry/orchestration loops, multi-agent coordination), **alongside** it (custom LLM calls outside the SDK, tools that aren't registered with the SDK, downstream services), and **below** it (post-processing, parsing, persistence). These are the manual spans that will sit around any auto-captured SDK content. If the location holds more than one distinct AI workflow, note each.
10. Present a numbered list of workflows found, ordered by value (most complex or LLM-heavy first). For each, give:
   - **Trace boundary**: the outer workflow function that will be the trace function root (per step 6, NOT the SDK/agent call itself)
   - **Inputs**: the shape of the function's inputs, and an explicit note that they're serializable by the SDK's tracing layer. If the natural outer boundary's inputs are unserializable (live browser/runtime objects, HTTP req/res, stream writers, sockets, opaque request contexts, live dependency/billing objects), state that here and present the three resolutions from step 6 as part of this workflow's entry: **(a) instrument via the framework handler/processor** (recommended when the workflow runs on LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK; for callback handlers, the handler-recorded root stays replayable via a same-key wrapper in the replay script; for trace processors, OpenAI Agents SDK, use the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) in place of the run call so it records a replayable keyed root that takes the run input — a bare processor over plain `run()` records an empty-input root and is not replayable on its own), **(b) move the boundary inward to `<specific inner function with serializable inputs>`** (recommended when no framework handler applies and an obvious candidate exists; not a refactor), or **(c) refactor**. Do not proceed to step 11 until the user picks one, never instrument an unserializable root. **If the user picks (c), present a refactor plan, labeled as *visibility* (extract + export, logic unchanged) or *structural* (new pure-core fn), and get an explicit second confirmation before modifying code. See the "Refactor confirmation" rule below.**
   - **Output**: if the boundary returns a live stream (Vercel AI SDK `streamText` result, a `ReadableStream`, an SSE / streaming `Response`), note it here. In the **TypeScript and Python SDKs this is NOT a refactor**: instrument with the `finalize` option (TS `withSpan(key, { finalize }, fn)` with `finalizers.aiSdk` / `finalizers.readableStream`; Python `@client.span(key, finalize=...)` over an async generator with `finalizers.openai_chunks` / `finalizers.anthropic_events`), which records a serializable view while the live stream still reaches the caller (per step 6). Present it as the plan, do not offer a structural rewrite for a streaming output when `finalize` covers it. On Ruby/Go, fall back to a serializable run-to-completion core.
   - **What's covered end-to-end**: the work above, alongside, and below any agent/LLM/SDK call that this trace will capture (be specific: list the orchestration, custom LLM calls, tools, downstream services that will become spans)
   - **Why tracing it is valuable**

   The description must commit to the actual scope. If the plan will only auto-capture an SDK's internals, say so explicitly, do NOT use language like "complete tracing of X workflow" when the trace will only cover an SDK call's internals.

   Recommend one to start with. **Ask the user to pick exactly ONE workflow to instrument first.** Never accept "multiple" or "all", each Instrument cycle produces exactly one trace function with one trace plan and one set of code changes. If the user wants to instrument several, they will be done sequentially via the loop in step 15, one at a time.
11. **Read function signatures you'll reference in the trace plan**: root function first, then any whose parameter names or return fields aren't already obvious from the discovery read (the step 8 scan, or the targeted step 9 read on the point-to-it path). Skipped leaf functions only need their names; don't Read them unless their shape appears in the plan. Never guess names. See "Trace Plan Format" and "Trace Plan Accuracy" in the Reference section below.
12. **Build the trace plan under a hard constraint: the resulting instrumentation must be purely additive.** If a candidate tree requires *any* behavior change to make spans nest correctly (awaiting a stream that wasn't awaited, delaying a call, reordering operations, blocking a callback, restructuring control flow), the tree is invalid, restructure the *tree* instead (make spans siblings, split into separate trace functions across separate cycles, or accept a flatter shape). Never present a behavior-changing approach as an option, not even as a non-recommended alternative.

   **For trace processor SDKs (OpenAI Agents SDK, etc.), extend beyond the processor.** The processor only auto-captures what runs *inside* the SDK's instrumented call (LLM calls, tool calls, handoffs). Everything above it (orchestration, retries, input prep), alongside it (non-SDK LLM calls, unregistered tools, downstream services), and below it (post-processing, persistence) is invisible unless you add manual spans. Default to a **hybrid plan**: trace function root wraps the workflow with manual `●` spans, the SDK call appears as one `(agent)` child whose grandchildren are `[auto]` lines, and other manual spans capture the work around it. A bare auto-only plan (root = the SDK call, no surrounding manual spans) is only valid when the workflow truly is just the SDK call with no surrounding work, confirm there's nothing meaningful above/alongside/below before defaulting to it. **Even then, route the bare call through the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) instead of plain `run()`: it records a replayable keyed root carrying the run input with the processor's spans nested underneath. A bare auto-only plan over plain `run()` records an empty-input root and is NOT replayable, which conflicts with the trace-boundary gate in step 6: fall back to it only when the user has explicitly accepted an observable-only trace. Whenever there is surrounding work, use the hybrid plan with a `withSpan`/`@span` root that takes the run input.**

   **One flow = one trace function key.** When an outer `@bitfab.span` / `withSpan` / `bitfab_span` and a framework handler wrap the same work (LangGraph / LangChain `get_langgraph_callback_handler`, OpenAI Agents SDK `get_openai_agent_handler`, Claude Agent SDK `get_claude_agent_handler`, Vercel AI SDK `getVercelAiMiddleware`), pass the **same key** to both, a second key splits one flow into two overlapping trace functions. Separate trace functions describe separate flows with their own standalone roots, never a sub-range of an outer flow.

   Then post the plan to the browser confirmation UI via `mcp__plugin_bitfab_Bitfab__create_trace_plan` and open it with the `openTracePlan.js` CLI, which navigates Studio to the trace plan page and polls for the user's Confirm/Cancel decision via agent session events.

   - Build a `TracePlanTree` (`{ rootId, nodes: { [id]: TraceNode } }`) from the same span tree you'd otherwise render. Each `TraceNode` carries `id` (stable, e.g. hash of `file:line:name`), `name`, `kind` ("manual" | "auto" | "pure"), `file`, `line`, `signature`, `parentId`, `childIds`, plus `framework` (for `[auto]` lines).
   - **Every captured node MUST include `sampleInput` and `sampleOutput`.** Without samples the confirmation page can't show the user what gets captured, which is the whole point. Construct realistic example values from the function's parameter and return types (Read the file and its return-type imports if needed); for SDK calls (`openai.chat.completions.create`, `generateText`, `cohere.rerank`, etc.) use the documented response shape. Do NOT call `create_trace_plan` with a captured node missing either field.
   - **Include surrounding code as `pure` context nodes** so the captured set is legible inside its codebase context and the user can toggle additional nodes into the capture directly in the UI without leaving the page. The test for inclusion is **"would the user plausibly want this as its own span?"**: anything they might promote to a wider root, wrap as a deeper child, or add as a peer at the same depth. Walk in three directions:
     - **~10 callers above the root**: candidates for **promoting the root upward** to a wider scope. Walk via Grep (callers of the root, then callers of those, etc.) and attach each as a `pure` ancestor. Stop at process entry points (HTTP handlers, queue workers, CLI `main`, cron jobs, page handlers, framework boot, there is no useful root above those) or when you've gathered ~10 nodes.
     - **~10 callees below each leaf**: candidates for **wrapping deeper spans**. For every captured leaf, walk downward (callees of that leaf, callees of those, etc.) and attach each as a `pure` descendant. Include any callee the user might plausibly want as its own span, LLM / tool / agent calls, prompt construction, response parsing, retry loops, fan-outs, post-processing that drives another model. Stop at pure plumbing (pass-through returns, trivial formatting or arithmetic, no further interesting activity) or ~10 nodes per leaf. **Don't stop just because you crossed an SDK / framework / stdlib boundary**: the test is "is this plausibly its own span?", not "is this in our code?".
     - **~5 siblings per captured non-root node**: candidates for **peer spans at the same depth**. For each captured non-root node, include the parent's other callees (other functions invoked from the same wrapper) as `pure` siblings. These are the nodes the user might wrap alongside the existing capture to widen the trace sideways.
     All surrounding nodes get `kind: "pure"` and are **not** included in `capturedNodeIds`. They serve two ends: **legibility** (the captured set sits inside its surrounding code so the user sees what is and isn't traced) and **modification** (they are the levers in the UI for expanding capture deeper, broader, or sideways).
   - Call `mcp__plugin_bitfab_Bitfab__create_trace_plan` with `{ language, tree, capturedNodeIds, traceFunctionKey }` (and `stats` if you have a sample run), `capturedNodeIds` is your initial recommendation, must form a connected sub-tree (selecting any descendant implies its ancestors). `traceFunctionKey` is the key you'll pass to `getFunction` / `get_function` / `bitfab_function` / `WithFunctionName` in step 13; persisting it lets future Modify cycles bootstrap their `before` tree from this plan via `get_trace_plan({ traceFunctionKey })` instead of re-deriving from code. The tool returns a plan id (and a `https://bitfab.ai/studio/trace-plan/<id>` URL).
   - Open the trace plan in the browser by running:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openTracePlan.js" <planId>
   ```

   (`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin directory; `<planId>` is the id returned by `mcp__plugin_bitfab_Bitfab__create_trace_plan`.) The script navigates Studio to the trace plan page and **blocks** until the user clicks **Confirm** or **Chat about this**.

   - The script emits JSONL to stdout. The first line is `{"event":"session-ready","sessionId":"<uuid>"}` once the Studio session is established (on a logged-out run, an `{"event":"auth-required",...}` then `{"event":"authenticated",...}` line precede it while the user signs in, keep waiting for `session-ready`). On exit, parse the final JSON line:
     - `{"event":"confirmed","planId":"<uuid>"}`, the user confirmed in the browser. The `planId` may differ from the original if a mid-session `create_trace_plan` call created a new plan (the script auto-tracks the latest plan via `tracePlan:created` events). Call `mcp__plugin_bitfab_Bitfab__get_trace_plan` with the returned `planId` to read the authoritative `capturedNodeIds` for step 13. If it differs from your initial recommendation, prune `[auto]` lines whose ancestor manual span was uncaptured, and drop manual `●` wraps that aren't in the set.
     - `{"event":"cancelled","planId":"<uuid>"}`, the user aborted from the browser. Tell them the trace setup was dropped and ask what they'd like to do instead. Do not write instrumentation.
     - non-zero exit (including `{"event":"timeout",...}`), surface the error to the user. Do not write instrumentation.

   **Inline fallback** (use only if `mcp__plugin_bitfab_Bitfab__create_trace_plan` errors, e.g. offline or MCP unreachable): present the trace plan **using the format defined in the "Trace Plan Format" reference section below** (legend → grammar → template precedence → canonical example). **STOP**: use `AskUserQuestion` to confirm before writing code.
13. **Write the instrumentation edits (11a) and the replay pipeline (11b) for this trace function in the same cycle. Default to writing both yourself, inline**, reusing what you already hold in context: the Replay section you fetched in step 5 and the root / deps / entrypoint files you read in the discovery step (8 or 9) and step 11. Do NOT re-fetch docs or re-read those files. That cold-context reload is the main cost a subagent adds, and for a typical single-root instrumentation (a handful of edits) inline is faster than dispatching one. Skip the replay pipeline entirely for Go-only projects (Go does not support replay).

   **Delegate 11b to a subagent only when 11a is itself a large mechanical fan-out** (>10 files of the same wrapper pattern) whose generation genuinely overlaps the replay work. In that case dispatch in a single message (your 11a fan-out plus one `Agent(subagent_type="general-purpose")` call for 11b) so the two run concurrently, and brief the subagent self-containedly using the 11b bullets below (it won't see your conversation, so it must WebFetch the replay reference itself).

   - **11a. Instrumentation edits**: follow the SDK reference exactly, purely additive. Never change behavior, arguments, return values, error handling, variable names, types, control flow, or code structure. Batch repetitive edits into one message (many Edit calls); for large mechanical fan-outs (>10 files of the same wrapper pattern), validate the pattern on one file, then delegate the rest to a subagent.

   - **11b. Replay pipeline**: write or update the replay script (`scripts/replay.*` or the project's equivalent) yourself, grounded in the Replay section you already fetched in step 5. Re-skim that section now to confirm the current signature; do NOT re-fetch it or write from memory. The items below are the contract the script must satisfy (and, in the large-fan-out exception above, the brief for the subagent, which must WebFetch `https://docs.bitfab.ai/<language>-sdk.md` itself since it won't share your context):
     - **Trace function key**: confirmed in the trace plan.
     - **Trace function root**: name, full signature (param names + types), return type, absolute file path, and import path the replay script will use.
     - **Handler-instrumented workflows (no decorated root)**: when this cycle's instrumentation is a framework handler (LangGraph / LangChain callback handler, OpenAI Agents SDK run wrapper, Claude Agent SDK handler, Vercel AI SDK middleware) rather than a decorated root function, replace the "Trace function root" item with key-based replay: the replay pipeline passes the handler's key plus a plain callable to `replay()` (Python: `client.replay("<key>", fn, ...)`; TypeScript: `bitfab.replay("<key>", fn, opts)`), and the callable re-invokes the framework entrypoint with the recorded root input. The SDK wraps the callable internally; on SDKs that predate explicit-key replay, wrap it under the same key yourself (Python `@bitfab.span("<key>")`, TS `getFunction(key).withSpan(...)`). Brief the subagent on: the framework entrypoint + import path (e.g. the compiled graph's `invoke`/`ainvoke`, the agent run call), the recorded root-input shape (a dict root input like a LangGraph state arrives as a single positional argument on the explicit-key path; on the older same-key-wrapper path it splats into kwargs, so legacy Python wrappers take `(**state)`), and the environment the wrapper must construct fresh (framework config, dependency objects), using **safe no-op substitutes for side-effectful wiring** (billing/credit callbacks, notification senders) so replay never charges or notifies anyone. The handler-recorded production traces and the wrapper share the key, which is all `replay()` needs; never report a handler-instrumented key as not replayable.
     - **Replay script target**: path to an existing script if one exists (`scripts/replay.*` or the project's equivalent, add a new pipeline entry), otherwise the path to create new.
     - **Non-negotiables**: CLI arg for pipeline name; optional `--limit N` (default 10), `--trace-ids id1,id2`, and `--dataset-id <uuid>` flags (`--trace-ids` wins over `--limit` when both are passed: the SDK ignores `limit` with a warning, since an explicit ID list determines the count; `--dataset-id` forwards to `replay()` and is preferred for dataset replays: passed alone it replays the dataset's traces and durably attributes the experiment to the dataset); replay fn imports and invokes the real function (never a stub); if that function is already `withSpan`/`@span`-wrapped, pass it to `replay()` directly, never re-wrapped in a fresh closure (a plain arrow like `(x) => wrappedFn(x)` carries no trace function key, so `replay()` adds its own root span around it while `wrappedFn` records its own span underneath, nesting a duplicate); runs in the app's loaded `.env` environment (no mocked DB clients / env vars / config / models); mocks only what has no live counterpart at replay time (stream writers, session/request stubs); follows the Replay Output Contract (emit the full `ReplayResult` as one JSON block via `JSON.stringify(result, null, 2)` / `json.dumps(result, indent=2, default=str)` / `JSON.pretty_generate(result)`, including every item's `durationMs`/`duration_ms`, `tokens`, and `model`; never swap the JSON block for per-field log lines, counts, lengths, hashes, or previews); prints a short human-readable summary + test run URL before the JSON dump; lives under `scripts/` (or the project's existing scripts location).
     - **Match the Replay-section template's fn signature verbatim, no speculative defense.** The SDK invokes the replay wrapper with captured args in their original shape; don't branch on arg arity/shape, don't add type-checker escape hatches (`any` casts, `cast(Any, ...)`, ignore comments, untyped passthroughs), and don't guard against cases the contract precludes. If the root signature in the brief contradicts what the reference template expects, return that fact so the main agent can re-check; don't paper over it in code. A hard error at the call site beats silent passthrough of malformed input.
     - **Per-item error tolerance**: `bitfab.replay` records thrown wrapped-fn errors in `item.error` and keeps going; rely on that. Don't wrap the fn in try/catch returning a placeholder, that turns infra failures (stale rows, FK violations, rejected writes) into fake successes. Only allowed top-level catch: a fatal handler around `main()` that exits non-zero, so callers can tell a whole-replay crash from a clean run with some unreplayable items.
     - **Side-effect check**: if importing the instrumented function triggers module-level side effects (booting listeners/ports/prod connections), do not work around it silently; flag it to the user (a subagent returns that fact in its report so the main agent can flag it).
     - **Result**: confirm the script path written/edited and surface any flags worth the user knowing (signature mismatches, import side effects, kwarg uncertainties). A subagent returns this as its one-line report.

   The trace plan's `Files changed:` list must include the replay script path for this cycle (new or edited) alongside the instrumented files.
14. Tell the user how to run the app to generate the first trace AND, once traces exist, how to run the replay script for this pipeline, give exact command(s) for both. Do NOT run them yourself. (Omit the replay command for Go-only projects.)
15. **MANDATORY STOP, never silently end the cycle without the A/B/C/D prompt.** Use `AskUserQuestion` (we recommend **A**: generate traces before instrumenting the next workflows):

   > A) **Generate traces [current workflow]** *(recommended)* → step 10
   > B) **Instrument [next workflow]**: [why it's the next highest value] → step 10
   > C) **Instrument [other workflow]**: [alternative] → step 10
   > D) **Done instrumenting**: proceed to Replay (in `wizard` mode) / Done (in `instrument` mode) → the `setup-replay` skill (mode `wizard`); otherwise the `setup-cleanup` skill

   **For option A**, present the script to run to the user (allow them to let you run it for them). Before starting the wait, tell the user verbatim: `Polling for first trace (up to ~10 min), press Esc to cancel.` Then run with `Bash` (timeout: 660000ms): `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/waitForTrace.js" <trace-function-key>`. The command blocks inside Node, polling Bitfab every 10s until a trace lands or the ~10 min timeout fires, so no agent tokens are burned while waiting. When it exits, parse the final stdout line as JSON: `{"status":"found","traceId":"…","url":"…"}` → report the trace URL; `{"status":"timeout",…}` → note that no trace arrived yet; `{"status":"interrupted",…}` → the user cancelled.

   A, B, and C all return to step 10 for the selected workflow. Only D exits the Instrument loop. **If the next workflow the user wants isn't already in the discovered list** (common when the first cycle came from the point-to-it path, where step 9 only read the one named location), first run another discovery pass, scan via step 8 or read another named location via step 9, then present. Never tell the user there's nothing left to instrument just because the targeted read only surfaced one workflow.

   **After D in `wizard` mode, Replay ALWAYS runs** as a coverage-verification/backfill sweep. Step 13 already wrote a replay pipeline for every trace function instrumented in this session, so Replay is usually a no-op that confirms coverage; it still runs to catch any pre-existing trace function keys that don't yet have a pipeline and to verify Replay Output Contract compliance across all pipelines. Replay does not depend on traces existing, replay scripts are built from trace function keys in the instrumented code, not captured trace data. In `instrument` mode, D stops after the Instrument loop.

   **Next:**

   - Option D (Done instrumenting) (mode `wizard`): invoke the `setup-replay` skill with mode `wizard`.
   - Option D (Done instrumenting) (mode `instrument`): invoke the `setup-cleanup` skill with mode `instrument`.

## Refactor confirmation (applies to Instrument's workflow-selection step and Replay's safety-net step)

Whenever the user picks "refactor to extract a pure core" (or any option that modifies existing functions/call sites, not just adds new wrappers), you must:

1. **Build a refactor plan** listing:
   - **Flavor**: **visibility** (extract + export, logic unchanged) or **structural** (new pure-core fn with serializable inputs, may require callers to construct them). Most cases are visibility.
   - **Source**: the function(s) that will be modified, with file path and current signature
   - **Extraction**: the new function name, its signature, and (for visibility refactors) an explicit note that the logic moves unchanged
   - **Trace wrap**: which function will carry the `getFunction(...)` / SDK trace wrap after the refactor
   - **Call sites**: every caller that will be rewritten, with file path and line range

2. **Present the plan verbatim** to the user, in the same format above.

3. **AskUserQuestion** with exactly two options:
   - **"Apply refactor"**: proceed to write the changes
   - **"Cancel"**: return to the previous AskUserQuestion (Instrument's workflow-selection (a)/(b)/(c), or Replay's safety-net three-option prompt) so the user can pick a different resolution

Never modify existing code on a refactor path without completing this three-step confirmation. Adding new instrumentation wrappers to unchanged functions is not a refactor, this rule does not apply to Instrument's write-instrumentation step (purely-additive instrumentation).

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
2. **Trace processor (bare) template**: when the workflow truly is *just* the SDK call with no surrounding work. Use the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) in place of the plain run call: it records a keyed root carrying the run input, and the processor's auto-captured children nest underneath as `[auto]` lines, so the bare workflow is **replayable with no hand-written root**. **A plain `run()` under the processor alone records an empty-input root (the agent span carries no recorded input): observable but NOT replayable — only acceptable when the user has explicitly accepted an observable-only trace for this workflow.** Confirm before using this, if the workflow has any input prep, orchestration, retries, post-processing, or non-SDK LLM/tool calls, use the hybrid template instead.
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
