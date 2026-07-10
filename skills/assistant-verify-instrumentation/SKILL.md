---
name: assistant-verify-instrumentation
description: Phase 2: Verify Instrumentation & Replay phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion", "Skill"]
---

# Bitfab Assistant: Phase 2: Verify Instrumentation & Replay

**Run only when mode is `wizard`.**

Check that this trace function has both instrumentation and a replay script.

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Verifying instrumentation"`.

   Search the codebase for the trace function key to find where the SDK is used:

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
2. Search for a replay script that covers this trace function:

   - Look for files matching `scripts/replay.*`, `scripts/*replay*`, or any file that imports `bitfab.replay` / `client.replay`
   - Read the script and check that it maps the target trace function key

   If a replay script exists but targets a different function key, do NOT modify the existing script or suggest changing the code's function key. Instead, treat it as "no replay script for this function" and offer to create a new one.

   If no replay script exists or it doesn't cover this function, use `AskUserQuestion`:

   > "No replay script found for `<traceFunctionKey>`."
   >
   > A) **Create replay now**: create the replay script inline *(recommended)* → step 3
   > B) **Pick a different function** → the `assistant-identify-function` skill
   > C) **Stop** → the `assistant-cleanup` skill

   If the user chooses **"Create replay now"**, create the replay script inline: fetch the SDK replay reference (`https://docs.bitfab.ai/reference/typescript.md` or the equivalent for the project language) and the script template (`https://docs.bitfab.ai/typescript-sdk.md`), then write a new replay script following the template. For keys with a decorated or manually wrapped root function, the function passed to `bitfab.replay(...)` / `client.replay(...)` must be the exact same exported top-level traced wrapper that production/runtime calls to create the root span; you must do this unless it is genuinely impossible in the host app. Inconvenience, extra refactoring, an inline wrapper, or needing to move code is not impossible. If production currently creates that wrapper inline inside a route, job, handler, callback, or local file scope, extract it into the nearest appropriate service/module, export it, and update both production and replay to import and call that same symbol. Do not replay a convenient inner helper unless that exact helper is also the production root traced wrapper, and do not create duplicate semantic wrappers split across production and replay with names like `runX`, `processX`, or `generateX`. If exported-symbol parity is impossible, stop and document the concrete blocker that prevents any shared exported root symbol. The script must accept `--limit N`, `--trace-ids`, `--name <name>`, `--code-change <path>`, `--experiment-group-id <uuid>`, and `--dataset-id <uuid>` flags. Pass the SDK's ready-made progress reporter into the replay's progress callback (`onProgress: reportReplayProgress` in TS, `on_progress=report_replay_progress` in Python, `on_progress: Bitfab.method(:report_replay_progress)` in Ruby, the template already does this) so it streams `@@bitfab:progress {json}` lines that `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js"` turns into one relayable line per trace. Capture the full `ReplayResult` in one variable and print that JSON to stdout for direct runs; when `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js"` sets `BITFAB_REPLAY_RESULT_PATH`, the SDK writes the same final result file automatically and the wrapper reads that file first. Do NOT hand-code writes to `BITFAB_REPLAY_RESULT_PATH` in the script. Do NOT invoke `/bitfab:setup replay` as a separate skill. After creating the script, check its capabilities and include the required final verification fields: `Replay root parity:`, `Production root symbol:`, `Production import/path:`, `Replay symbol:`, `Replay import/path:`, `Same symbol? yes/no`, and `If no, why is this impossible?`.

   **Handler-instrumented keys (no decorated root function) are replayable too.** If the key is registered via a framework handler (`get_langgraph_callback_handler("key")`, `get_openai_agent_handler("key")`, `get_claude_agent_handler("key")`, `getVercelAiMiddleware("key")`, or the TS equivalents) rather than `@span`/`withSpan`, follow the docs' "Replaying handler-instrumented functions" section: pass the handler's key plus a plain callable to `replay()` (the SDK wraps it internally), re-invoking the same framework entrypoint production calls with a freshly constructed environment (safe no-op substitutes for billing callbacks and other side-effectful wiring). On SDKs that predate explicit-key replay, wrap the callable under the same key yourself. Never report a handler-instrumented function as not replayable.

   **Next:**

   - Option B (Pick a different function) (mode `wizard`): invoke the `assistant-identify-function` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Stop) (mode `wizard`): invoke the `assistant-cleanup` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
3. **Detect replay script capabilities.** Check what the replay script supports. These flags determine how experiment results are tracked and displayed in Phase 5. **If you already ran this step for the same trace function earlier in this session, skip it and continue. Re-run if the user switched functions via "Pick a different function".**

   **1. Use the replay script located in the previous step** (or grep for `scripts/replay.*` / files importing `bitfab.replay` / `client.replay`).

   **2. Grep the replay script for the flags it forwards:**

   | Grep the script for | Flag | What it enables |
   |----------|------|-----------------|
   | `code-change` or `code_change` | `supportsCodeChanges` | Code diffs attached to each experiment in the dashboard |
   | `experiment-group-id` or `experiment_group_id` | `supportsExperimentGroups` | Live streaming of results in Studio as replay runs |
   | `dataset-id` or `dataset_id` | `supportsDatasetId` | Durable attribution of the experiment to its dataset (shows under the dataset's experiments) |
   | `--name` plus `name` / `name:` forwarded to `replay()` | `supportsExperimentNames` | Human-readable experiment/test-run names in the UI |
   | `traceId` or `trace_id` in the output/print section | `supportsReplayTraceIds` (re-confirmed post-replay in `check-trace-id-support`) | Verdict persistence, cross-iteration comparison, Studio experiments page |

   `supportsInputAdapters` is **not** a script-grep flag (the script gains an `adaptInputs` / `adapt_inputs` argument only after a signature actually drifts, in `adapt-replay-inputs`). It comes solely from the installed SDK in step 3.

   **3. Confirm the installed SDK supports each flag.** A flag the script forwards is silently ignored when the installed SDK predates it, so each flag is gated on the SDK too. Run the capability probe (it resolves the installed SDK version from the lockfile/manifest and gates every capability by version, with no dist-file grepping across package-manager layouts):

   ```bash
   cd <project-dir> && node "${CLAUDE_PLUGIN_ROOT}/dist/commands/detectCapabilities.js"
   ```

   Read the `<bitfab-replay-capabilities>` block. Each line is a JSON object for one detected SDK with `language`, `workspacePath`, `current` (resolved version), `versionResolved`, `updateAvailable`, `latest`, and a `capabilities` object holding `supportsExperimentGroups`, `supportsDatasetId`, `supportsCodeChanges`, `supportsReplayTraceIds`, `supportsInputAdapters`, `supportsExperimentNames`. Pick the line whose `language` (and `workspacePath`, in a monorepo) matches the replay script's project.

   - **Combine the two sources:** a flag is true only when the script forwards it (step 2) **and** that SDK's matching `capabilities.*` is true. Take `supportsInputAdapters` straight from `capabilities.supportsInputAdapters` (it has no script side).
   - `supportsReplayTraceIds` from the probe is a definitive **pre-replay** signal; the later `check-trace-id-support` step still re-confirms from the actual replay output.
   - If `versionResolved` is `false`, the probe couldn't pin the installed version, so every capability defaulted false and is **unverified**. Check that one SDK by hand before relying on the flags (TypeScript: grep `node_modules/@bitfab/sdk/dist/index.d.ts` for the option names and `ReplayItem.traceId`; Python: the installed `bitfab/replay.py`; Ruby: the installed gem's `replay.rb`), or resolve the version and re-run.

   If the script has a flag but the SDK's `capabilities.*` is false, mark that flag **false**. Prioritize upgrading the SDK over using fallbacks: without replay trace IDs, verdict labels can't be persisted (benchmark/experiment results stay in-agent only).

   **4. Route on the result.**

   If all flags are true, skip the question and continue silently.

   If one or more flags are false, tell the user which capabilities are missing and what they affect, then use `AskUserQuestion`. List the missing capabilities in the question text:

   > "Your replay script is missing support for:
   >
   > [if !supportsCodeChanges] **Code changes**: edits won't appear in the experiment dashboard
   > [if !supportsExperimentGroups] **Experiment groups**: no live streaming; results appear in Studio after each run
   > [if !supportsDatasetId] **Dataset attribution**: the experiment won't be durably linked to its dataset (still findable via the trace-lineage fallback; fixed by regenerating the script / upgrading the SDK)
   > [if !supportsExperimentNames] **Experiment names**: runs will show as generated IDs instead of readable names
   > [if !supportsReplayTraceIds] **Replay trace IDs**: experiment results can't be persisted or compared across iterations (your SDK needs an upgrade)
   >
   > [if !supportsInputAdapters] **Input adapters**: replay can't recover traces when the function's signature drifts after capture (fixed by upgrading the SDK)"

   > A) **Upgrade the replay script**: regenerate the script with full support, then continue *(recommended)* → step 4
   > B) **Continue without**: run experiments with the current script; missing features are skipped → the `assistant-iterate` skill (mode `experiment` or `fix` or `benchmark`); stop (mode `cost-optimize` or `add-trace`); the `assistant-cleanup` skill (mode `replay`); otherwise the `assistant-dataset` skill

   **Next:**

   - All flags are true (mode `wizard`): invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option B (Continue without) (mode `wizard`): invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
4. **Upgrade the SDK and replay script.** The replay script references SDK APIs (`name`, `experimentGroupId`, `codeChangeDescription`, per-item `traceId`, `adaptInputs` / `adapt_inputs`) that require a recent SDK. Upgrade the SDK first, then regenerate the script.

   **1. Upgrade the SDK.** Run the capability probe to read the installed version and update status (skip if you still have its block from `detect-replay-capabilities`):

   ```bash
   cd <project-dir> && node "${CLAUDE_PLUGIN_ROOT}/dist/commands/detectCapabilities.js"
   ```

   For the SDK matching this project, the `<bitfab-replay-capabilities>` block reports `current` (resolved version), `latest`, `updateAvailable`, and `renameFrom`. If `updateAvailable` is false, the SDK is already current, skip to step 2. Otherwise run the package manager's update command:
   - TypeScript: `pnpm update @bitfab/sdk` (in monorepos, scope with `--filter <pkg>`). **If `package.json` pins an exact version (e.g. `"@bitfab/sdk": "0.13.4"` with no `^`/`~`), `pnpm update` will NOT move past the pin, bump the spec in `package.json` to the reported `latest` first (e.g. `"@bitfab/sdk": "0.13.6"`), then `pnpm install`.**
   - Python: `uv lock --upgrade-package bitfab-py && uv sync` or `poetry update bitfab-py`
   - Ruby: `bundle update bitfab --conservative`

   If `renameFrom` is set (the SDK is on the legacy `bitfab` package instead of `@bitfab/sdk`), remove the old package and install `@bitfab/sdk`.

   **2. Regenerate the replay script.** Locate the replay script for this trace function (found in `detect-replay-capabilities`). Fetch the SDK replay reference (`https://docs.bitfab.ai/reference/typescript.md` or the equivalent for the project language) and the script template (`https://docs.bitfab.ai/typescript-sdk.md`). Then edit the script to add the missing flags:
   - **`--code-change <path>`**: parse the JSON file, pass `codeChangeDescription` and `codeChangeFiles` to `replay()`
   - **`--experiment-group-id <uuid>`**: pass `experimentGroupId` to `replay()`
   - **`--name <name>`**: pass `name` to `replay()` so the resulting experiment/test run has a readable title
   - **`--dataset-id <uuid>`**: pass `datasetId` to `replay()`. This is the **preferred way to replay a dataset**: passed alone (no `--trace-ids`) the server replays exactly the dataset's traces and durably attributes the experiment to the dataset. Adding this flag is what lets the replay step drop the hand-enumerated `--trace-ids` list.
   - **Preserve replay root parity**: while editing decorated or manually wrapped roots, verify the function passed to `bitfab.replay(...)` / `client.replay(...)` is the exact same exported top-level traced wrapper that production/runtime calls to create the root span. You must preserve this unless it is genuinely impossible in the host app; inconvenience, extra refactoring, an inline wrapper, or needing to move code is not impossible. Do not switch to a convenient inner helper, do not create a replay-only semantic wrapper (`runX`, `processX`, `generateX`), and if the current script already violates this, fix the production/replay imports to share one exported root symbol before continuing. For handler-instrumented keys with explicit-key replay, verify the callable invokes the same production framework entrypoint; this handler path is the explicit-key exception to exported-function replay, not permission to call a different helper. If exported-symbol parity is impossible, stop and document the concrete blocker that prevents any shared exported root symbol.
   - **Replay Output Contract**: capture the full `ReplayResult` (including every item's `traceId`, `durationMs`, `tokens`, `model`) in one variable and print the JSON as one stdout block for direct runs. When `BITFAB_REPLAY_RESULT_PATH` is set by `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js"`, the SDK writes that final result file automatically; do not hand-code plugin transport in the script. Human-readable summary always goes to stderr.
   - **Replay root parity verification**: when reporting the upgraded replay script, include the required final verification section: `Replay root parity:`, `Production root symbol:`, `Production import/path:`, `Replay symbol:`, `Replay import/path:`, `Same symbol? yes/no`, and `If no, why is this impossible?`.
   Do NOT invoke `/bitfab:setup replay` as a separate skill; edit the script inline here.

   **3. Re-check capabilities.** After upgrading and editing, re-run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/detectCapabilities.js"` and re-read the `capabilities` object for this SDK (the probe now sees the upgraded version). Combine again with the script-side grep from step 2 and update the flags in working context. If any are still missing after the upgrade, note it but continue.

   **Next:**

   - Mode `wizard`: invoke the `assistant-dataset` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
