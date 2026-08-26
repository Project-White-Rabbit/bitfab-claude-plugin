---
name: setup-replay
description: Replay phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Read", "Glob", "Grep", "Edit", "Write", "WebFetch", "AskUserQuestion", "Skill"]
---

# Bitfab Setup: Replay

**Run only when mode is `replay`.**

Create or update replay registry modules for instrumented trace functions. Requires instrumentation in the codebase; does **not** require existing traces, replay registry modules are created from trace function keys in the code, not captured trace data.

The SDK-installed `bitfab-replay` command lets the team regression-test any registered trace function against production data with one command: it fetches historical traces, re-runs them through the current code, and reports old vs. new outputs side-by-side. The project owns only the registry module. Note: **Go does not support replay**: skip this phase if the project is Go-only.

**Relationship to Instrument.** Instrument's write-instrumentation step writes each replay pipeline alongside the instrumentation edits. Run this mode standalone (`/bitfab:setup replay`) to catch pre-existing trace function keys that predate that step or were added outside the skill.

**Source of truth:** two pages, read both before creating or modifying a replay registry module. Do not improvise from memory.
- **Canonical `replay` API signature, options, and return shape:** `/reference/typescript.md`, `/reference/python.md`, `/reference/ruby.md` (Go has no replay). Use this for the exact field names (`result` / `originalOutput` vs `original_output`), default `limit`, `maxConcurrency`/`max_concurrency`, error behavior.
- **Copy-pasteable registry template + installed-command contract + input serialization caveat:** `/typescript-sdk.md`, `/python-sdk.md`, `/ruby-sdk.md`. Use this for the language-specific registry shape and the standard `bitfab-replay --registry <path> <pipeline>` invocation.

1. **Gather all trace function keys** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). This is the source of truth for what replay must cover.
2. **Search for existing replay registry modules**: files matching `scripts/replayRegistry.*`, `scripts/replay_registry.*`, or files defining an SDK `ReplayRegistry` / `defineReplayRegistry` (fall back to direct replay API calls for legacy scripts).
3. **Compare coverage.** Replay is non-interactive once entered, do not ask the user whether to create or add registry modules. Determine which case applies:
   - **All keys already have replay registry entries:** verify one project registry module exports or defines the SDK `ReplayRegistry` / `defineReplayRegistry` and every entry references the exact production root. The SDK-installed `bitfab-replay` executable owns the Replay Output Contract and all common flags; the project module must not invoke a runner or reimplement flags. Legacy expanded scripts should be migrated to a registry-only module. Once every key is registered, proceed to the replayable-root review.
   - **Some keys are missing entries, or no replay registry exists yet:** add the missing entries or create the registry module next.
4. **Create the replay registry module** following the example in the SDK reference's Replay section (`https://docs.bitfab.ai/<language>-sdk.md`), adapted to this codebase. The project file must contain only normal app bootstrap/imports, registry entries, and per-function defaults. It must not invoke a replay runner. The SDK-installed `bitfab-replay` executable loads the module passed through `--registry` and owns argument parsing, progress callbacks, code-change loading, summaries, and result serialization. The non-negotiables are:
   - **Ground the registry in the docs, not memory.** Before writing it, fetch `https://docs.bitfab.ai/reference/<language>.md` for the canonical registry shape, then `https://docs.bitfab.ai/<language>-sdk.md` for the module template and executable command. Quote the exact registry export convention and command in your plan.
   - **For keys with a decorated function in the app: register the decorated function itself, not an undecorated wrapper.** The trace function key is read from the decorator/attribute on the function stored in the registry. A plain closure around the decorated function (for example `(x) => fn(x)`) carries no key and would create a duplicate nested root, so register the decorated function directly. For Python class methods, register `Class.method` or a bound `instance.method`. For Ruby, register the production `receiver` and `method_name`.
   - **Handler-instrumented keys (no decorated function in the app) register an explicit key.** When a key is recorded only via a framework handler (`get_langgraph_callback_handler("key")`, `get_openai_agent_handler("key")`, `get_claude_agent_handler("key")`, `getVercelAiMiddleware("key")`, or the TS equivalents), register the plain callable that re-invokes the same production framework entrypoint, plus the key explicitly (TypeScript `traceFunctionKey`; Python/Ruby `trace_function_key`). The callable receives the recorded root input and reconstructs only the runtime wiring the production entrypoint needs. Every unsafe production action reached through that wiring must remain behind a replay-mockable marked span. Use a no-op only for a genuinely replay-only callback slot with no production action and no recorded call to mock.
   - **Replay root parity (hard rule):** for keys with a decorated or manually wrapped root function, the function stored in the registry must be the exact same exported top-level traced wrapper that production/runtime calls to create the root span. You must do this unless it is genuinely impossible in the host app; inconvenience, extra refactoring, an inline wrapper, or needing to move code is not impossible. If production creates that wrapper inline inside a route, job, handler, callback, or local file scope, extract it into the nearest appropriate service/module, export it, and update both production and replay to import and call that same symbol. Do not replay a convenient inner helper unless that exact helper is also the production root traced wrapper. Avoid duplicate semantic wrappers split across production and replay with names like `runX`, `processX`, or `generateX`. For handler-instrumented keys with explicit-key replay, verify parity against the production keyed handler/run-wrapper entrypoint that re-invokes the same framework entrypoint production calls. If exported-symbol parity is impossible, stop and document the concrete blocker.
   - **Replay root parity verification:** when reporting replay setup completion, include the required final verification section: `Replay root parity:`, `Production root symbol:`, `Production import/path:`, `Replay symbol:`, `Replay import/path:`, `Same symbol? yes/no`, and `If no, why is this impossible?`.
   - **Use the same `Bitfab` client across instrumentation and replay.** Import it from the instrumented module or a shared singleton; never construct a second client inside the registry module.
   - Register every pipeline name with the same client and exact production function/method. Decorated roots supply their trace function key automatically; plain handler roots declare it on the registry entry.
   - The SDK-installed `bitfab-replay` executable supplies `--limit`, `--trace-ids`, `--name`, `--concurrency`, `--code-change`, `--experiment-group-id`, `--dataset-id`, `--grader-ids`, and `--mock`. Never parse or forward these in the registry module.
   - Put only function-specific defaults such as `adaptInputs` / `adapt_inputs`, mock overrides, or database snapshots on the registry entry.
   - **Each registry entry MUST reference the actual instrumented function** (for handler-instrumented keys: a callable that re-invokes the actual framework entrypoint), never a stub or identity function. If historical inputs need reshaping, use the registry entry's input adapter.
   - **Load the app normally.** The registry module imports app code as a library, and the executable loads that module. Use the project's normal env loader around `bitfab-replay` when needed and keep module-scoped clients, config, and models wired as the app expects. This is for dependency resolution and fidelity, not safety.
   - **Handler wiring safety:** synthesize only genuinely replay-only slots with no production action and no recorded call to mock. Every production billing, notification, write, or other unsafe callback must retain its real wiring behind a selected replay-mockable marked span. For factory-created instrumented functions (taking session or stream writers via closure), the wrapper may pass:
     - Stream/socket writers: no-op (`{ write: () => {}, merge: () => {} }`), no client on the other end
     - Session/request identifiers: minimal stub with the fields the function reads
   - **Caveat: watch for module-level import side effects.** Loading the registry transitively runs the app's module initialization before replay interception exists. If that opens listeners, binds ports, or performs unsafe external actions, stop and move those actions behind a replay-mockable boundary.
   - The SDK executable owns the Replay Output Contract, including plugin progress, stderr summary, stdout JSON, and `BITFAB_REPLAY_RESULT_PATH`; do not duplicate any of it.
   - Live in a `scripts/` directory (or the project's existing scripts location)
5. **Legacy instrumentation with a non-replayable root.** First decide whether any instrumented trace function can't be replayed from the replay registry module. Two failure modes: **(1) not invocable**, the function isn't exported or is defined inline in a route handler; **(2) not replayable**, its root takes unserializable inputs (live SDK/DB clients, HTTP `Request`/`Response`, stream writers, sockets, opaque request contexts), so even an invocable call replays with empty or stubbed args. Such functions were introduced before Instrument's trace-boundary serializability requirement, or via another path. Reason from each function's signature and visibility, and where a captured trace exists for the key, compare the signature against the trace data: an empty or `<unserializable: ...>`-stubbed recorded root input confirms the root isn't replayable. Do not execute the script to detect this.

   **Keyed root-handler keys are not affected.** A key registered only via a callback handler or a trace-processor run wrapper (LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK) has no decorated function by design and records the framework's serializable input as the root; create its pipeline with the key-based replay pattern from step 4 instead of offering these resolutions. **Bare trace-processor-only keys (OpenAI Agents SDK over plain `run()`) ARE affected, not exempt:** the processor records an empty-input root, so a processor-only key with neither the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) nor a manual `withSpan`/`@span` root is not replayable. Offer the resolutions below, with "route the run through the run wrapper, or add a manual root that takes the run input" as the fix.

   - **every instrumented function is invocable from the replay registry module and its root is replayable (nothing left to resolve)**: nothing to resolve → the `setup-cleanup` skill

   If one or more functions can't be invoked or aren't replayable, use `AskUserQuestion` offering Instrument's trace-boundary resolutions:

   > A) **Move the trace to an inner function** → the `setup-cleanup` skill
   > B) **Refactor** *(recommended)* → the `setup-cleanup` skill
   > C) **Leave as-is**: add a header comment explaining why this one can't be replayed later (it can't be called directly, or it records no inputs to replay from over plain run() with an empty-input root) and flag that the script will rot → the `setup-cleanup` skill

   **If the user picks "Refactor" (or a boundary move that requires rewriting callers), present a refactor plan labeled as *visibility* or *structural* and get a second confirmation before modifying code (the "Refactor confirmation" rules below say what the plan must contain).**

   **Next:**

   - Every instrumented function is invocable from the replay registry module and its root is replayable (nothing left to resolve) (mode `replay`): invoke the `setup-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option A (Move the trace to an inner function) (mode `replay`): invoke the `setup-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option B (Refactor) (mode `replay`): invoke the `setup-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Leave as-is) (mode `replay`): invoke the `setup-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).

## Refactor confirmation (applies to Instrument's workflow-selection step, Replay's non-replayable-root step, and any write-instrumentation step that turns out non-additive)

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
   - **"Cancel"**: return to the previous AskUserQuestion (Instrument's workflow-selection (a)/(b)/(c), or Replay's non-replayable-root three-option prompt) so the user can pick a different resolution

Never modify existing code on a refactor path without completing this three-step confirmation. Adding new instrumentation wrappers to unchanged functions is not a refactor and does not need this confirmation (purely-additive instrumentation). But if the write-instrumentation step itself turns out to require modifying, re-implementing, or hand-reconstructing an existing call to seat a root (the wrap is not actually additive), that IS a refactor: stop and run this three-step confirmation before touching the code.
