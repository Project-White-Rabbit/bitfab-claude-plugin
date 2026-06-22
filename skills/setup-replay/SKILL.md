---
name: setup-replay
description: Replay phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Read", "Glob", "Grep", "Edit", "Write", "WebFetch", "AskUserQuestion", "Skill"]
---

# Bitfab Setup: Replay

**Mode:** you were dispatched with a mode (`wizard` or `replay`); the gates and Next routing below depend on it.

**Run only when mode is `wizard` or `replay`.**

Create or update replay scripts for instrumented trace functions. Requires instrumentation in the codebase; does **not** require existing traces, replay scripts are created from trace function keys in the code, not captured trace data.

Replay scripts let the team regression-test any trace function against production data with one command, they fetch historical traces, re-run them through the current code, and report old vs. new outputs side-by-side. Note: **Go does not support replay**: skip this phase if the project is Go-only.

**Relationship to Instrument.** When Replay runs via `wizard` mode or directly after Instrument, most (often all) trace function keys already have pipelines because Instrument's write-instrumentation step writes them alongside the instrumentation edits in the same cycle. This phase is then a coverage + contract-compliance sweep. Run it standalone (`/bitfab:setup replay`) to catch pre-existing trace function keys that predate that step or were added outside the skill.

**Source of truth:** two pages, read both before creating or modifying a replay script. Do not improvise from memory.
- **Canonical `replay` API signature, options, and return shape:** `/reference/typescript.md`, `/reference/python.md`, `/reference/ruby.md` (Go has no replay). Use this for the exact field names (`result` / `originalOutput` vs `original_output`), default `limit`, `maxConcurrency`/`max_concurrency`, error behavior.
- **Copy-pasteable script template + replay output contract + input serialization caveat:** `/typescript-sdk.md`, `/python-sdk.md`, `/ruby-sdk.md`. Use this for the `scripts/replay.<ext>` shape and the rules for what to print to stdout.

1. **Gather all trace function keys** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). This is the source of truth for what replay must cover.
2. **Search for existing replay scripts**: files matching `scripts/replay.*`, `scripts/*replay*`, or any file importing/calling the SDK's replay API.
3. **Compare coverage.** Replay is non-interactive once entered, do not ask the user whether to create or add scripts. Determine which case applies:
   - **All keys already have replay scripts:** verify each one conforms to the Replay Output Contract in the docs (emits the full `ReplayResult` as one JSON block, including every item's `traceId`/`trace_id`, `durationMs`/`duration_ms`, `tokens`, and `model`, never just counts or per-field log lines) and supports all four optional flags (`--code-change`, `--experiment-group-id`, `--trace-ids`, `--dataset-id`). Fix any that don't conform or are missing flags. Once every script is present and conformant, coverage is complete, there is nothing to create, proceed to the replayability safety-net (a conformant script can still wrap a non-replayable root, so the safety-net runs in this path too, not just when scripts are missing).
   - **Some keys are missing scripts, or no replay scripts exist yet:** the missing scripts must be created next.
4. **Create the replay script** following the example in the SDK reference's Replay section (`https://docs.bitfab.ai/<language>-sdk.md`), adapted to this codebase. The non-negotiables (enforced by the docs page, repeated here so the script review catches them):
   - **Ground the script in the docs, not memory.** Before writing the replay call, fetch `https://docs.bitfab.ai/reference/<language>.md` for the canonical signature and return shape, then `https://docs.bitfab.ai/<language>-sdk.md` for the script template and output contract. Quote the exact function signature + return-shape fields verbatim in your plan. Field names differ per language (Python: `result`, `original_output`; TypeScript: `result`, `originalOutput`; Ruby: `:result`, `:original_output`), do not paraphrase or invent names like `new_output`/`trace_id`.
   - **For keys with a decorated function in the app: pass the decorated function itself, not an undecorated wrapper.** The trace function key is read from the decorator/attribute on the function you pass in. A plain closure around the decorated function (e.g. `(x) => fn(x)`) carries no key, so `replay()` wraps the closure as the root span while the decorated function records its own span underneath, nesting a duplicate, pass the decorated function directly. (Handler-instrumented keys have no decorated function; see the next bullet.) For Python class methods, pass `Class.method` (or a bound `instance.method`). For TypeScript, the key is passed as a string arg alongside the function, use the exact key from the instrumented code. For Ruby, pass `receiver` + `method_name:` + `trace_function_key:` matching the `traceable` decoration.
   - **Handler-instrumented keys (no decorated function in the app) replay by explicit key.** When a key is registered only via a framework handler (`get_langgraph_callback_handler("key")`, `get_openai_agent_handler("key")`, `get_claude_agent_handler("key")`, `getVercelAiMiddleware("key")`, or the TS equivalents), there is no decorated function to import; that does NOT make the key unreplayable. Define the pipeline's replay function in the script as a plain callable and pass the key explicitly (Python: `client.replay("<key>", fn, ...)`; TypeScript: `bitfab.replay("<key>", fn, opts)`), re-invoking the framework entrypoint with the recorded root input (a dict root input arrives as a single positional argument) plus a freshly constructed environment (framework config, dependency objects). On SDKs that predate explicit-key replay, wrap the callable under the same key yourself (Python `@bitfab.span("<key>")` with a `(**state)` signature for dict roots; TS `getFunction(key).withSpan(...)`). Substitute safe no-ops only for side-effectful wiring with no live counterpart at replay time (billing/credit callbacks, notification senders). The pattern is documented in the SDK docs' Replay section (handler subsection).
   - **Use the same `Bitfab` client across instrumentation and replay.** Import it from the instrumented module (or a shared singleton), never construct a second client inside the replay script, or registered trace functions won't resolve.
   - Accept a pipeline name as a CLI argument
   - Accept optional `--limit N` (default 10) and `--trace-ids id1,id2` flags. When both are passed, `--trace-ids` wins: the SDK ignores `limit` with a warning (an explicit ID list determines the count)
   - Accept optional `--code-change <path>` flag: path to a JSON file shaped `{ "description": string, "files": [{ "path": string, "before": string, "after": string }] }`. Read the file, then pass its `description` as `codeChangeDescription` / `code_change_description` and its `files` as `codeChangeFiles` / `code_change_files` into the SDK's `replay()` call. Forward the file objects through verbatim, do **not** add a `repo`, `commit`, or other context fields; `path` is the sole identifier (use `""` for newly created or deleted files). The improve skill's iteration loop writes this file before invoking the script so each experiment shows the literal edit alongside its results in the dashboard.
   - Accept optional `--experiment-group-id <uuid>` flag: pass the value as `experimentGroupId` / `experiment_group_id` into the SDK's `replay()` call. This groups test runs from the same iteration so the experiments page can stream results live as the replay runs.
   - Accept optional `--dataset-id <uuid>` flag: pass the value as `datasetId` / `dataset_id` into the SDK's `replay()` call. For replaying a dataset, **prefer `--dataset-id` over `--trace-ids`**: when `--dataset-id` is passed without `--trace-ids`, the server replays exactly that dataset's traces AND durably attributes the resulting experiment to the dataset (it shows under the dataset's experiments even when trace lineage can't be reconstructed). Passing the dataset's trace IDs by hand is no longer necessary. If both flags are passed, every trace ID must belong to the dataset or the server rejects the call.
   - Map pipeline names to trace function keys and their replay functions
   - **Each pipeline's replay function MUST import and call the actual instrumented function** (for handler-instrumented keys: import and re-invoke the actual framework entrypoint), never a stub or identity function. If the function signature doesn't match the raw input shape, reshape arguments in the wrapper.
   - **Replay runs in the app's environment.** The script imports the app as a library, DB clients, env vars, config loaders, and model IDs resolve from the loaded environment. Do **not** mock them. Run the script with `.env` loaded (e.g. `pnpm with-env tsx scripts/replay.ts`, `dotenv run -- python scripts/replay.py`, or the project's equivalent) so the app's normal bootstrap applies.
   - **Only mock what has no live counterpart at replay time.** For factory-created instrumented functions (taking session, stream writers via closure), the wrapper passes:
     - Stream/socket writers: no-op (`{ write: () => {}, merge: () => {} }`), no client on the other end
     - Session/request identifiers: minimal stub with the fields the function reads
   - **Caveat: watch for module-level import side effects.** Importing the instrumented function transitively runs the app's module initialization, if that opens listeners, binds ports, or connects to prod, the replay script inherits it. When in doubt, confirm the replay env points at a staging/local DB before running.
   - **Follow the docs' Replay Output Contract**: capture the full `ReplayResult` (items + `testRunId` + `testRunUrl`, including `durationMs`/`duration_ms`, `tokens`, and `model` per item) into one variable and emit it as a single JSON object to stdout via `JSON.stringify(result, null, 2)` (TS), `json.dumps(result, indent=2, default=str)` (Python), or `JSON.pretty_generate(result)` (Ruby). A subagent reading the output must be able to `JSON.parse` / `json.loads` one contiguous block, do not replace the JSON dump with per-field log lines, counts, lengths, hashes, or previews. Writing the same JSON to `scripts/replay-result.json` in parallel is optional but encouraged.
   - Print a short human-readable summary (total replayed, same, changed, errors) and the test run URL ahead of the JSON dump
   - Live in a `scripts/` directory (or the project's existing scripts location)
5. **Safety net for legacy instrumentation.** First decide whether any instrumented trace function can't be replayed from the replay script. Two failure modes: **(1) not invocable**, the function isn't exported or is defined inline in a route handler; **(2) not replayable**, its root takes unserializable inputs (live SDK/DB clients, HTTP `Request`/`Response`, stream writers, sockets, opaque request contexts), so even an invocable call replays with empty or stubbed args. Such functions were introduced before Instrument's trace-boundary serializability gate, or via another path. Reason from each function's signature and visibility, and where a captured trace exists for the key, compare the signature against the trace data: an empty or `<unserializable: ...>`-stubbed recorded root input confirms the root isn't replayable. Do not execute the script to detect this.

   **Keyed root-handler keys are not a safety-net case.** A key registered only via a callback handler or a trace-processor run wrapper (LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK) has no decorated function by design and records the framework's serializable input as the root; create its pipeline with the key-based replay pattern from step 4 instead of offering these resolutions. **Bare trace-processor-only keys (OpenAI Agents SDK over plain `run()`) ARE a safety-net case, not an exemption:** the processor records an empty-input root, so a processor-only key with neither the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) nor a manual `withSpan`/`@span` root is not replayable. Offer the resolutions below, with "route the run through the run wrapper, or add a manual root that takes the run input" as the fix.

   - **every instrumented function is invocable from the replay script and its root is replayable (no safety-net case applies)**: nothing to resolve → the `setup-cleanup` skill

   If one or more functions can't be invoked or aren't replayable, use `AskUserQuestion` offering Instrument's trace-boundary resolutions:

   > A) **Move trace boundary inward** → the `setup-cleanup` skill
   > B) **Refactor** *(recommended)* → the `setup-cleanup` skill
   > C) **Leave as-is**: add a header comment noting why the key isn't replayable (not callable, or a non-replayable root such as a bare processor-only key over plain run() with an empty-input root) and flag that the script will rot → the `setup-cleanup` skill

   **If the user picks "Refactor" (or a boundary move that requires rewriting callers), apply the "Refactor confirmation" rule below, present a refactor plan labeled as *visibility* or *structural* and get a second confirmation before modifying code.**

   **Next:**

   - Every instrumented function is invocable from the replay script and its root is replayable (no safety-net case applies) (mode `wizard` or `replay`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `replay`).
   - Option A (Move trace boundary inward) (mode `wizard` or `replay`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `replay`).
   - Option B (Refactor) (mode `wizard` or `replay`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `replay`).
   - Option C (Leave as-is) (mode `wizard` or `replay`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `replay`).

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
