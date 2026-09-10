---
name: assistant-verify-instrumentation
description: Phase 2: Verify Instrumentation & Replay phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion", "Skill"]
---

# Bitfab Assistant: Phase 2: Verify Instrumentation & Replay

**Run only when mode is `wizard`.**

Check that this trace function has both instrumentation and a replay registry entry.

1. Search the codebase for the trace function key to find where the SDK is used:

   - TypeScript: `grep -r "<traceFunctionKey>" --include="*.ts" --include="*.tsx"`
   - Python: `grep -r "<traceFunctionKey>" --include="*.py"`
   - Ruby: `grep -r "<traceFunctionKey>" --include="*.rb"`
   - Go: `grep -r "<traceFunctionKey>" --include="*.go"`

   If the key is found, note the file location, this is the code you'll iterate on in later phases.

   If the key is NOT found in the codebase, the function is instrumented elsewhere (the traces exist on Bitfab). Use `AskUserQuestion` to ask:

   > "I can't find `<traceFunctionKey>` in this codebase, it may be instrumented in another repo or under a different key."
   >
   > A) **Instrument now**: set up tracing in this codebase *(recommended)* → the `assistant-cleanup` skill
   > B) **Continue anyway**: work with the traces even without local code → the `assistant-dataset` skill
   > C) **Pick a different function** → the `assistant-identify-function` skill
   > D) **Stop** → the `assistant-cleanup` skill

   If the user chooses **"Instrument now"**, tell the user to run `/bitfab:setup instrument` first, then come back with `/bitfab:assistant wizard <key>`. Do NOT invoke the setup skill from within this flow; it will break the assistant flow's continuity. If **"Continue anyway"**, skip the replay-script check and start building the dataset, there's no local code to iterate on yet.

   **Next:**

   - Option A (Instrument now) (mode `wizard`): invoke the `assistant-cleanup` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option B (Continue anyway) (mode `wizard`): invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Pick a different function) (mode `wizard`): invoke the `assistant-identify-function` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option D (Stop) (mode `wizard`): invoke the `assistant-cleanup` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
2. Search for a replay registry module that covers this trace function:

   - Look for `scripts/replayRegistry.*`, `scripts/replay_registry.*`, or a module defining `ReplayRegistry` / `defineReplayRegistry`
   - Read the registry and check that an entry maps a pipeline name to the target trace function key and the exact production root
   - Treat a project-owned file that parses replay flags or calls `replay()` as a legacy expanded script, not a current registry

   If a registry exists but targets a different function key, do not change the code's function key. Treat it as no registry entry for this function and offer to add one.

   If no registry entry exists, use `AskUserQuestion`:

   > "No replay registry entry found for `<traceFunctionKey>`."
   >
   > A) **Create registry entry now**: create or update the replay registry inline *(recommended)* → step 3
   > B) **Pick a different function** → the `assistant-identify-function` skill
   > C) **Stop** → the `assistant-cleanup` skill

   If the user chooses **"Create registry entry now"**, fetch the SDK replay reference (`https://docs.bitfab.ai/reference/typescript.md` or the equivalent for the project language) and the language guide (`https://docs.bitfab.ai/<language>-sdk.md`), then create or update the project registry. The project owns only app imports/bootstrap, mappings to exact production roots, and per-function defaults such as `mock`, `adaptInputs` / `adapt_inputs`, and database branching. The module must not parse CLI arguments, call `replay()`, install lifecycle callbacks, print output, or handle `BITFAB_REPLAY_RESULT_PATH`; the SDK-installed `bitfab-replay` executable owns those behaviors.

   For decorated or manually wrapped roots, the registry must import the exact same exported top-level traced wrapper that production/runtime calls to create the root span. If production creates that wrapper inside a route, job, handler, callback, or local scope, extract it into the nearest import-safe service/module and update production and the registry to import the same symbol. Do not create duplicate semantic wrappers. For handler-instrumented keys, register the key with a plain callable that invokes the same framework entrypoint and reconstructs runtime wiring. If root parity is impossible, stop and document the concrete blocker.

   After editing, report `Replay root parity:`, `Production root symbol:`, `Production import/path:`, `Registry symbol:`, `Registry import/path:`, `Same symbol? yes/no`, and `If no, why is this impossible?`. Do not invoke `/bitfab:setup replay` as a separate skill.

   **Mandatory pre-run replay safety check.** Complete this before executing replay for the first time, and re-run it whenever the registry entry, replay root, span boundaries, dispatch model, or mock strategy changes. Do not discover unsafe coverage by running replay: a successful email, payment, queue publish, or database write has already caused the damage.

   1. Read the replay registry entry and require an explicit recorded-output strategy: normally `mock: "marked"` / `mock="marked"`; `all` is allowed only when every matched recorded child is intentionally frozen. Never accept `none` for a path with unsafe external actions.
   2. Trace every unsafe action reachable from the replay root (database writes, outbound mutations, queue publishes, emails, payments, file/vector writes). Under `marked`, each must execute inside a manual descendant span marked `mockOnReplay: true` / `mock_on_replay: true`. Auto-observed spans, unwrapped calls, root-inline work, and import-time work are not intercepted. Move the boundary before proceeding; if that cannot be done without changing behavior, report the exact blocker and stop.
   3. Verify the selected wrapper executes as a descendant in the same replay context. Python thread pools and `threading.Thread` require `Bitfab(trace_across_threads=True)`; pre-created queue consumers and other processes are not covered. Ruby span state is thread-local, so work dispatched to another or pre-created thread/process is not mockable from the replay root. Move the unsafe boundary into the replay context or stop. Ordinary same-context TypeScript async work and Python `asyncio` tasks/`asyncio.to_thread` retain context.
   4. In TypeScript, a synchronous selected span cannot consume the lazy recorded-output fetch used by `mock: "marked"`. Use an already-async/Promise-returning boundary, or use `mock: "all"` only when freezing every matched child is compatible with the experiment. Never change a production function's return type just to make replay work; if neither option is valid, stop.

   The SDK fails a selected mock closed when its historical tree or occurrence is unavailable, but that protects only calls that pass this check. Hold `replaySafetyVerified = true` only after every unsafe action passes it.

   **Next:**

   - The replay safety check finds any uncovered or unmockable unsafe action (mode `wizard`): invoke the `assistant-cleanup` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option B (Pick a different function) (mode `wizard`): invoke the `assistant-identify-function` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Stop) (mode `wizard`): invoke the `assistant-cleanup` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
3. **Detect installed replay capabilities.** Common flags, progress events, result serialization, and replay trace IDs belong to the SDK-installed `bitfab-replay` executable. Do not inspect or modify the project registry for CLI flag support. **Reuse a capability result for the same workspace and installed SDK version; re-run after switching projects or upgrading the SDK.**

   Run the capability probe from the application workspace:

   ```bash
   cd <project-dir> && node "${CLAUDE_PLUGIN_ROOT}/dist/commands/detectCapabilities.js"
   ```

   Read the matching line from the `<bitfab-replay-capabilities>` block. Select by `language` and, in a monorepo, `workspacePath`. Hold `supportsExperimentGroups`, `supportsDatasetId`, `supportsCodeChanges`, `supportsReplayTraceIds`, `supportsInputAdapters`, and `supportsExperimentNames` directly from that SDK's `capabilities` object. If `versionResolved` is false, resolve the installed version or inspect that SDK installation before relying on a capability; do not infer support from the registry module.

   If all capabilities are true, continue silently. If any are false, tell the user which SDK capabilities are missing and what they affect, then use `AskUserQuestion`:

   > "Your installed Bitfab SDK is missing support for:
   >
   > [if !supportsCodeChanges] **Code changes**: edits won't appear in the experiment dashboard
   > [if !supportsExperimentGroups] **Experiment groups**: results cannot stream into one group during the run
   > [if !supportsDatasetId] **Dataset attribution**: the experiment won't be durably linked to its dataset
   > [if !supportsExperimentNames] **Experiment names**: runs will show generated IDs
   > [if !supportsReplayTraceIds] **Replay trace IDs**: verdicts can't be persisted or compared
   > [if !supportsInputAdapters] **Input adapters**: replay can't adapt historical inputs after signature drift"

   > A) **Upgrade the SDK**: upgrade the installed replay executable, then continue *(recommended)* → step 4
   > B) **Continue without**: run experiments with the current SDK; missing features are skipped → the `assistant-iterate` skill (mode `experiment` or `fix` or `benchmark`); stop (mode `cost-optimize` or `add-trace`); the `assistant-cleanup` skill (mode `replay`); otherwise the `assistant-dataset` skill

   **Next:**

   - All flags are true (mode `wizard`): invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option B (Continue without) (mode `wizard`): invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
4. **Upgrade the installed SDK and replay executable.** The project registry does not own common flags, progress callbacks, or result serialization, so do not regenerate it merely to gain those capabilities.

   Run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/detectCapabilities.js"` from the application workspace and use the matching SDK line's `current`, `latest`, `updateAvailable`, and `renameFrom` fields. If an update is available, use the project's package manager:
   - TypeScript: `pnpm update @bitfab/sdk` (scope monorepos with `--filter <pkg>`). If the manifest pins an exact version, update that spec to `latest` and install.
   - Python: `uv lock --upgrade-package bitfab-py && uv sync` or `poetry update bitfab-py`
   - Ruby: `bundle update bitfab --conservative`

   If `renameFrom` identifies the legacy TypeScript `bitfab` package, replace it with `@bitfab/sdk`. Re-run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/detectCapabilities.js"` after the upgrade and hold the new capability values. Edit the replay registry only when the upgraded SDK reports an actual registry schema incompatibility or the pipeline needs a per-entry default such as `adaptInputs` / `adapt_inputs`; never add CLI parsing, callbacks, output printing, or `BITFAB_REPLAY_RESULT_PATH` handling to project code.

   **Next:**

   - Mode `wizard`: invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
