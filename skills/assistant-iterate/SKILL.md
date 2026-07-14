---
name: assistant-iterate
description: Phase 5: Iterate with Replay phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Write", "Agent", "AskUserQuestion", "Skill", "mcp__plugin_bitfab_Bitfab__read_traces", "mcp__plugin_bitfab_Bitfab__read_trace_labels", "mcp__plugin_bitfab_Bitfab__set_human_labels", "mcp__plugin_bitfab_Bitfab__list_datasets", "mcp__plugin_bitfab_Bitfab__create_dataset", "mcp__plugin_bitfab_Bitfab__add_traces_to_dataset", "mcp__plugin_bitfab_Bitfab__list_experiments", "mcp__plugin_bitfab_Bitfab__get_experiment_traces", "mcp__plugin_bitfab_Bitfab__get_replay_status"]
---

# Bitfab Assistant: Phase 5: Iterate with Replay

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `benchmark` or `fix`); the gates and Next routing below depend on it.

In `experiment` mode this is an iterative improvement loop (each iteration makes a change and replays). In `fix` mode the first pass replays only the target trace and tags that replay with an experiment group; once it passes the trace is added to the dataset (in `fix-add-to-dataset`), and after that replay's labels are persisted the user can choose to show the fix in Studio, re-run the full dataset as an experiment (in Studio or terminal-only, chosen in `fix-rerun-dataset-mode`), keep iterating, or stop. When that full-dataset re-run reveals real regressions (previously-passing traces the fix broke), `share-results` recommends reverting the fix to its pre-fix baseline and starting a fresh attempt (`fix-revert-and-restart`), with the target trace left saved red in the dataset. In `benchmark` mode it is a single replay of the current code followed by a terminal scorecard, no changes, no iteration.

This phase begins at `detect-replay-capabilities`. `experiment` / `benchmark` modes arrive from Phase 5 Setup (dataset already picked); `wizard` / `dataset` / `investigate` modes arrive from Phase 4 (dataset built in Phase 3); `fix` arrives from Phase Fix with `fixReplayScope = "single-trace"`. `openStudioTo.js` resolves the active session automatically. `benchmark` mode opens Studio only when the run opted in with the `studio` keyword; without it, benchmark opens no Studio and runs terminal-only. `fix` opens Studio only after the user explicitly chooses to inspect the single-trace before/after or run the full-dataset experiment.

1. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Detect replay script capabilities.** Check what the replay script supports. These flags determine how experiment results are tracked and displayed. **If you already ran this step in Phase 2 earlier in this session, skip it and continue to `make-change` (or `replay-against-dataset` in benchmark mode).**

   **1. Locate the replay script** (you found it in Phase 2 in `wizard` mode, or grep for `scripts/replay.*` / files importing `bitfab.replay` / `client.replay` now).

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

   > A) **Upgrade the replay script**: regenerate the script with full support, then continue *(recommended)* → step 2
   > B) **Continue without**: run experiments with the current script; missing features are skipped → step 3
2. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Upgrade the SDK and replay script.** The replay script references SDK APIs (`name`, `experimentGroupId`, `codeChangeDescription`, per-item `traceId`, `adaptInputs` / `adapt_inputs`) that require a recent SDK. Upgrade the SDK first, then regenerate the script.

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
3. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Generate the experiment group ID before making changes or running replay.** In normal dataset/experiment modes, also open the experiments page before replay so the user can watch results stream in live from the moment replay starts.

   **Fix-mode single-trace pass:** if mode is `fix` and `fixReplayScope = "single-trace"`, generate the `experimentGroupId` but do **not** open Studio yet. Hold this UUID as `fixSingleTraceExperimentGroupId` as well as the current `experimentGroupId`, then continue to `make-change`. This first pass is a targeted replay of the target trace, and the group exists only so the user can inspect the before/after in Studio after labels are persisted. If the user later chooses the full-dataset run (after the trace passed and `fix-add-to-dataset` attached it to the dataset), set `fixReplayScope = "dataset"` and return here; then generate a fresh `experimentGroupId` for the dataset experiment. Whether Studio opens for that dataset run depends on `fixDatasetStudio` (chosen in `fix-rerun-dataset-mode`): open the experiment page when it is true, keep Studio closed and report results in chat when it is false.

   **Generate an experiment group ID.** Generate a fresh UUID to use as the `experimentGroupId` for this iteration. This groups all test runs from this iteration together so the experiments page can stream results live as the replay runs.

   Treat the UUID as a literal value: substitute it directly into the `<experimentGroupId>` slot of each command below (and into `--experiment-group-id` in `replay-against-dataset`), exactly like `<tokensSuffix>`. **Do not assign it to a shell variable named `GID`, `UID`, `EUID`, or `EGID`** (in zsh these are read-only/integer special parameters bound to the process IDs, so `GID="$(uuidgen)"` makes the shell evaluate the UUID as arithmetic and throws `bad math expression: operator expected at '<hex>...'`). If you keep it in a variable at all, use a plain lowercase name like `gid`; a double-quoted experiments URL with `&` is otherwise shell-safe. If you ever see that `bad math expression` error, it is the variable name, not the `&` or the query string: rename the variable, do not rewrite the command.

   **Open the experiments page.** Pick exactly one case (they are mutually exclusive):

   - **`fix` mode with `fixReplayScope = "single-trace"`:** do NOT run any `openStudio` navigation yet. Keep Studio closed until the user explicitly chooses the post-replay "Show in Studio" option. Continue to `make-change`.
   - **`fix` mode with `fixReplayScope = "dataset"` and `fixDatasetStudio` false (terminal-only re-run):** do NOT run any `openStudio` navigation. Generate the experiment group ID above only to tag the test run on the server, then continue. The dataset run reports its results in chat (`share-results`), no Studio window.
   - **`benchmark` mode WITHOUT the `studio` opt-in:** do NOT run any `openStudio` navigation (no Studio is open). Just generate the experiment group ID above for tagging the test run on the server, then continue to `replay-against-dataset`.
   - **`benchmark` mode WITH the `studio` flag** (and `supportsExperimentGroups` is true): navigate Studio to the experiments page using the group ID **and** `&mode=benchmark`, so the page relabels its copy as "Benchmark" (the underlying run is still an experiment; only the displayed noun changes):

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio/experiments?experimentGroupId=<experimentGroupId>&mode=benchmark<tokensSuffix>"
     ```
   - **All other modes** (and `supportsExperimentGroups` is true): navigate Studio to the experiments page using the group ID (no `mode` parameter):

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio/experiments?experimentGroupId=<experimentGroupId><tokensSuffix>"
     ```

   `<tokensSuffix>` is a real placeholder, like `<experimentGroupId>`: resolve it from `costRun` (and, when set, `costBasis`) before you open the URL:
   - `costRun` false: substitute the empty string.
   - `costRun` set, `costBasis = all`: substitute `&tokens=1&tokenType=all`.
   - `costRun` set, `costBasis = uncached`: substitute `&tokens=1&tokenType=uncached`.

   Always emit `&tokenType=` explicitly when the lens is on (never a bare `&tokens=1`): the page's tokenType is sticky, so a bare `&tokens=1` after a prior `uncached` view would keep counting uncached against an all-basis intent. Pinning the basis on every tokens-bearing nav keeps the live lens matching the run. Because the slot is driven by the flags, the lens lands on for token/cost runs (on the basis you fixed at entry) and stays off for quality runs, with nothing to remember to add or strip per run. The only way to get it wrong is to leave a literal `<tokensSuffix>` in the command.

   **Token-cost lens (`&tokens=1&tokenType=<all|uncached>`).** When the URL carries `&tokens=1` the page turns on the token-cost lens: each trace and the experiment header show the original → replay total-token trend, streaming in next to pass/fail. `&tokenType=all` counts **all** tokens (`input + output`, cache reads included), tinted indigo (cheaper) / amber (costlier); `&tokenType=uncached` switches the same trend to the **uncached** basis (`(input - cached) + output`), tinted cyan / orange so it reads apart from the all-token view. A "Token count: All | Uncached" toggle in the page header flips it live too, and overrides the URL until the next tokens-bearing nav. On a quality run (`costRun` false) `<tokensSuffix>` resolves to nothing and the page looks exactly as it does today, so a non-cost run never carries the lens.

   This is a Studio-opening navigation call. Launch it as a background/long-running process and read its JSONL stdout incrementally; do not wait in the foreground for the user to act in Studio. The existing Studio session handles it. If `supportsExperimentGroups` is false, skip this navigation (the `open-experiments` fallback will navigate with `testRunIds` after the replay completes).
4. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate` or `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Making changes"`.

   **Make the change.**

   - **In `fix` mode, this is THE fix, and diagnosis was already done in Phase Fix `resolve` (refine it here as needed).** Re-read the failing trace (held from Phase Fix `resolve`) and the function code together, pinpoint why the output is wrong, and make the change that addresses it. The failure annotation you wrote in `resolve` is the acceptance criterion the first replay will check. If this step is being reached after the user chose to re-run the full dataset with the already-made fix (`fixReplayScope = "dataset"`, `fixSkipMakeChange = true`, and a previous single-trace fix already produced snapshots), do not edit again or ask for another change; reuse the last change description and before/after snapshots, then continue to replay the dataset.
   - Unless the previous bullet told you to reuse the existing fix, use `AskUserQuestion` to explain what you're changing and why, and confirm before editing
   - For every file you intend to edit in this experiment: **read the file with the Read tool first** and keep its full contents in working memory as the **before** snapshot. Then edit. Then **read the file again** to capture the **after** snapshot. Both snapshots are required by the next step (`replay-against-dataset`) so the experiment dashboard can render the literal edit alongside the results, this is per-experiment, not cumulative
   - **In `fix` mode, also record the revert anchor, per file on first touch.** The **first time** any fix edit touches a given file (when that repo-relative path is not yet a key in `fixBaselineSnapshots`), record that file's current pre-edit content under `fixBaselineSnapshots[path]`, and if the file **did not exist** before this edit (a file the fix is creating), also add its path to a `fixCreatedPaths` set. Track creation via the set, not by a `""` baseline value: an existing-but-empty file also has `""` content, so `fixCreatedPaths` is what lets the revert tell a created file apart from a pre-existing empty one. On later single-trace iterations, add newly-touched paths the same way but **never overwrite a path already captured** (the first capture is the true pre-fix baseline; a path already in `fixCreatedPaths` stays marked created). Accumulating per file, not just on the first edit, matters because a later iteration can touch a file the first attempt never did; if that path were missing, `fix-revert-and-restart` would leave its edit in place and only partially roll back. This map is the baseline `fix-revert-and-restart` restores to when a regression run backs the fix out; the per-experiment before/after snapshots above still cover the dashboard's per-edit view. A revert leaves `fixBaselineSnapshots` intact (every touched file is back to its captured baseline), so a fresh attempt after a revert reuses the same anchors and only adds paths it newly touches
   - Hold a one-line **change description** in working memory too (e.g. "fix off-by-one in retry logic", "tighten extraction prompt"). It will be the experiment's title in the viewer
   - If a file is newly created, the before snapshot is the empty string `""`. If a file is deleted, the after snapshot is `""`. The path is always the repo-relative file path, no `repo`, `commit`, or other context fields
5. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Running replay"`.

   **Replay against the selected scope.** In normal dataset modes, collect the trace IDs from the labeled dataset (built in Phase 3 in `wizard` and `dataset` modes, or rehydrated in Phase 5 Setup's `pick-dataset` step in `experiment` and `benchmark` modes). In `fix` mode, branch on `fixReplayScope`: `"single-trace"` means replay only the target trace ID from Phase Fix; `"dataset"` means replay the full dataset after the user explicitly opted into the Studio experiment. The experiment group ID was already generated in the `open-experiments-before-replay` step. For the initial `fixReplayScope = "single-trace"` pass, the group tags the targeted replay for optional before/after inspection but Studio is not opened yet.

   **In `benchmark` mode, skip the code-change payload entirely.** Benchmark makes no experiment-style edits to the traced function, so there is no code diff to capture. Omit `--code-change` from the invocation. The replay evaluates the current code as-is against the labeled dataset. Use `"Benchmark: current code baseline"` as the change description for display purposes. (Infra fixes are still allowed when a gap blocks the run, upgrading the SDK / replay script in `detect-replay-capabilities`, or adding `mockOnReplay` to a failing child span below, since none of those change the function's measured behavior. What you must not do is edit the traced function to alter its output.)

   **Write the code-change payload first (skip this entire block in `benchmark` mode, `make-change` never ran, there are no snapshots, and `--code-change` is omitted per the benchmark note above).** Before running the script, write a tmp JSON file (e.g. `/tmp/bitfab-code-change-<experimentN>.json`) using the snapshots captured in `make-change`:

   ```json
   {
     "description": "<the one-line change description from make-change>",
     "files": [
       { "path": "<repo-relative path>", "before": "<full file contents before edit>", "after": "<full file contents after edit>" }
     ]
   }
   ```

   The schema is flat, every file object is exactly `{ path, before, after }`. Do **not** add `repo`, `commit`, or any other context fields; `path` is the sole identifier. Use `""` for newly created or deleted files. One JSON file per experiment, never reuse last iteration's payload.

   **Check the `supportsCodeChanges` flag** (from `detect-replay-capabilities`). If false, skip writing the code-change JSON file and omit `--code-change` from the invocation. The replay itself is unaffected; only the code-change metadata is missing from the experiment viewer.

   **Check the `supportsExperimentGroups` flag** (from `detect-replay-capabilities`). If true and an `experimentGroupId` exists, pass `--experiment-group-id <experimentGroupId>` (from `open-experiments-before-replay`) so the test run is tagged with the group. This includes the initial `fixReplayScope = "single-trace"` pass. If false, skip the flag; the post-replay Studio inspection can fall back to `testRunId` when available.

   **Check the `supportsExperimentNames` flag** (from `detect-replay-capabilities`). If true, pass `--name "<experimentName>"` so the resulting experiment/test run is readable in the UI. Use the one-line change description from `make-change` as `<experimentName>`; in `benchmark` mode use `Benchmark: current code baseline`. Keep it 120 characters or fewer. If false, omit `--name`; this is cosmetic and the replay still runs.

   **Choose trace selection.**

   - **Initial `fix` pass (`fixReplayScope = "single-trace"`)**: pass `--trace-ids <targetTraceId>` (the trace ID held from Phase Fix `resolve`) and do NOT pass `--dataset-id`. This is the user's requested targeted replay. It proves the bug turned green before anything is added to a dataset or the rest of the dataset is run.
   - **Full dataset runs**: check the `supportsDatasetId` flag (from `detect-replay-capabilities`). When true, this is the **preferred way to replay the dataset**: pass `--dataset-id <datasetId>` (the dataset id held in working context: from `pick-dataset` in `experiment` / `cost-optimize` / `benchmark` modes, or from `fix-add-to-dataset` in `fix` mode, which skips `pick-dataset`) and **omit `--trace-ids` entirely**. The server replays exactly the dataset's traces and durably attributes the experiment to the dataset, so it shows under the dataset's experiments even when trace lineage can't be reconstructed, and you don't have to enumerate the dataset's trace IDs by hand. Only when `supportsDatasetId` is false do you fall back to `--trace-ids <the dataset's resolved trace ids>` (attribution then relies on the derived trace-lineage join). If the script lacks `--dataset-id`, prefer upgrading it (see `upgrade-replay-script`) over the trace-ids fallback.

   **Run the replay through `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js"` in the background, then relay the progress lines it prints.** Before starting, choose a unique run directory for this replay, for example `.bitfab/replays/<experimentN>-<timestamp>-<short-random>`, pass it with `--run-dir`, and hold that path in context; do not use a shared `--events-log` path. A foreground run blocks you for the whole replay and the user just sees "a shell is running" with no detail. `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js"` runs the replay, turns the SDK's per-trace `@@bitfab:progress` events into one self-contained line per trace on its stdout (a header, then for each trace as it settles a pass/fail glyph, the running `n/total`, and that trace's duration, with the error reason inline on failure, plus a liveness heartbeat line when a slow trace goes quiet so the run never looks frozen, then a final summary with total + average time), and writes a small JSONL event log at `<run-dir>/events.jsonl`: `type: "progress"` rows as items settle, then a final `type: "complete"` row. Large per-item payloads are written atomically under `<run-dir>/items/` and referenced by `item.itemPath` / `items[].itemPath`, so outputs are not duplicated in the event log. It also tees every human line to `<run-dir>/progress.log`, so the user can `tail -f` it in a separate terminal for a live view that never collapses the way a tool card does. The wrapper writes `<run-dir>/run.json`; once the server test run ID is known it also writes `<parent-of-run-dir>/by-test-run/<testRunId>/run.json` pointing back to the run directory. If the replay settles no traces at all (an `@bitfab/sdk` too old to carry the progress reporter, or a script that never wired `onProgress`), it closes with a `⚠ done · replay finished but reported no progress` line instead of ending silently, so a missing stream of per-trace lines never reads as a hang, fix it via `upgrade-replay-script` (or an SDK upgrade) and re-run. You do NOT decide what or when to print: it does the formatting; you just show each new line.

   1. **Launch it in the background** (use the Bash tool's background mode; never append a trailing `&`, that detaches and kills it). Pass `--label <pipeline-name>` for the header. Use whichever replay flags the script supports (omit unsupported ones):

   ```bash
   # The exact replay command depends on the script, adapt to what exists
   # Fix initial pass: replay only the target trace, no dataset-id, but tag it with an experiment group
   cd <project-dir> && node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js" --label <pipeline-name> -- npx tsx scripts/replay.ts <pipeline-name> --trace-ids <targetTraceId> --name "<experimentName>" --code-change /tmp/bitfab-code-change-<experimentN>.json --experiment-group-id <experimentGroupId>
   # Preferred (supportsDatasetId true): --dataset-id alone replays the dataset; no --trace-ids needed
   cd <project-dir> && node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js" --label <pipeline-name> --run-dir .bitfab/replays/<experimentN>-<timestamp>-<short-random> -- npx tsx scripts/replay.ts <pipeline-name> --dataset-id <datasetId> --name "<experimentName>" --code-change /tmp/bitfab-code-change-<experimentN>.json --experiment-group-id <experimentGroupId>
   # Fallback (older script/SDK without dataset-id support): pass the dataset's resolved trace IDs
   cd <project-dir> && node "${CLAUDE_PLUGIN_ROOT}/dist/commands/replayProgress.js" --label <pipeline-name> --run-dir .bitfab/replays/<experimentN>-<timestamp>-<short-random> -- npx tsx scripts/replay.ts <pipeline-name> --trace-ids <id1>,<id2>,<id3>,... --name "<experimentName>" --code-change /tmp/bitfab-code-change-<experimentN>.json --experiment-group-id <experimentGroupId>
   ```

   2. **Relay its output to the user as it runs.** Poll the background command's output every few seconds and **show the user each new line it prints, verbatim** (they are already formatted, one line per trace: `▶ generate-email · 20 traces`, `✓ 5/20 · 1.1s`, `✗ 7/20 · 0.3s · missing OPENAI_API_KEY`, `… 7/20 running · 24s elapsed` (a heartbeat while a slow trace runs), `⚠ done · 18 ok · 2 failed · 14.3s · avg 0.9s`). Do not parse, summarize, or re-decide cadence, just relay. Your relay is bursty (only between tool calls) and the tool card collapses; if the user wants a continuous, never-collapsing view, point them at `tail -f <logPath>` from this run's `run.json`, which shows every line the instant it is written. (If you are running this inside a parallel experiment subagent, your chat is not shown to the user, so skip relaying and just report at the end.)

   3. **Run the live replay/evaluation loop while the replay is still running.** Use the run directory you passed with `--run-dir` and poll `<run-dir>/events.jsonl` alongside the human output. Each `type: "progress"` JSONL row is a normalized SDK progress event; `item.traceId` is the **source/original trace id**. Treat a new successful progress row as "this original trace's replay item settled" and start evaluation for that item as soon as the row carries `item.itemPath` and a local `item.replayTraceId`: read `item.itemPath` for the full input, replay output, original output, and metadata. Failed progress rows become unreplayable candidates immediately and should be carried forward with their error string. If the row is progress-only (old SDK/current basic reporter: no `item.itemPath`/local replay trace id), do the cheap prep only and defer judging to the final `type: "complete"` row's item refs. If the JSONL file is missing or empty (old SDK, old replay script, unwired `onProgress`, or an unwritable log path), do not block or treat it as a replay failure: continue from the final complete event exactly as older scripts did from the old result file.

      For every item you can judge during the run, keep the verdict keyed by its **local** replay trace id. Periodically call `mcp__plugin_bitfab_Bitfab__get_replay_status` once you know the `testRunId` (enriched progress rows may carry `event.testRunId`; older scripts may only reveal it in the final `ReplayResult`). It returns the current replay test run status plus the local replay trace id → server replay trace id mapping for traces already persisted by the SDK. As soon as a judged item has a server replay trace id in that mapping, persist that small batch with `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/persistReplayLabels.js"`. Keep a set of server replay trace IDs already persisted so the final reconciliation never double-writes a verdict.

   4. **When the background command finishes, read the final `type: "complete"` row from this run's `events.jsonl`**. Its `result` carries run metadata (`testRunId`, `testRunUrl`, `itemCount`) and its `items` array carries item refs. Read each needed `items[].itemPath` for the full replay item (trace ID, duration, tokens, model, and full original/new outputs). Read from the **files**, not from the captured command output, which the harness truncates in the middle.

   **Before running: verify the replay script exposes the full original and new output values AND the replay trace ID (`item.traceId`) for every item** (not just lengths, counts, hashes, or truncated previews) so the run's `items/*.json` files carry them. If it doesn't, fix the script first, the Replay Output Contract and example script live in the SDK reference at `https://docs.bitfab.ai/<language>-sdk.md`. Subagents can't evaluate an improvement from `5 → 7 (+2)`, and missing trace IDs block verdict persistence.

   **Capture the `testRunId` from the replay complete event**: read the final `type: "complete"` row in this run's `events.jsonl`; it carries `testRunId` and `testRunUrl` when the SDK returned them. Track every `testRunId` produced across all iterations of this phase for the `open-experiments` fallback.

   **If a child span fails during replay, tag it with `mockOnReplay` instead of debugging it.** When a non-root span throws (missing API key for a paid call, flaky external service, deleted/moved dependency, env not reproducible), it usually blocks the whole trace from completing, even though the failure is environmental, not a bug in the function you're iterating on. The short-term fix is to mark that span as replayable from its recorded output:

   1. Find the failing span's call site in the codebase (`withSpan("<spanName>", ...)` in TS, `@bitfab.span` / `bitfab.span` equivalents in other SDKs). **This only works on a span whose call runs through a Bitfab wrapper** (a hand-written `withSpan` / `@span`, or a per-call middleware like Vercel AI's `wrapLanguageModel`). If the failing span is one the SDK only OBSERVES, reported by a callback handler, trace processor, stream, or collector (a LangChain / LangGraph node or tool, an OpenAI Agents / Claude Agent tool span, a BAML call), there is no span-options object to flag, and `mockOnReplay` cannot short-circuit it, replay only watches it and re-runs it for real. To mock such a span you must first wrap its underlying call in a manual `withSpan` / `@span` (move the boundary), then flag that manual span; otherwise use Workaround B (point replay at the source DB).
   2. Add the flag to its span declaration (TypeScript and Python today; Ruby and Go as they land):
      ```ts
      // TypeScript: SpanOptions.mockOnReplay
      bitfab.withSpan("expensive-llm-call", { mockOnReplay: true }, async () => { ... })
      ```
      ```python
      # Python: mock_on_replay kwarg on @client.span(...)
      @client.span("expensive-llm-call", mock_on_replay=True)
      def expensive_llm_call(...):
          ...
      ```
   3. Re-run the replay script passing `mock: "marked"` to `client.replay(...)` (or `mock="marked"` in Python). That child will return its historical output; the root function still runs real code.
   4. Flag the tag to the user: it's a replay-only escape hatch, has no effect on prod execution, and is worth removing once the underlying issue is fixed.

   Use this when the goal is to unblock iteration on the root function, not when the child itself is what you're trying to improve.

   **After the run, check whether replay trace IDs are populated.** Check whether `item.traceId` is a non-null string for every completed item. Hold the result as a boolean flag (`hasTraceIds`) for the `check-trace-id-support` step. If any are `null`, the user's SDK version or server does not support the replay trace ID mapping yet. Do NOT stop here, just flag it.

   **After the run, classify items before evaluating.** A failed item means one of three things: the new code produced a bad output (real signal), the wrapped fn threw on infra (missing DB row, stale FK, rejected write, missing env), or the recorded inputs no longer fit the function's current signature (the code's SHAPE drifted since the trace was captured: params renamed, reordered, collapsed into an options object, a new required arg added). Infra failures are not regressions; shape mismatches are not regressions either, they mean replay couldn't even call the function with the captured inputs.

   From the JSON compute:

   - `completed`, `item.error` unset
   - `shapeErrored`: `item.error` set AND the message reads like a signature/shape mismatch rather than infra. Tell-tale shapes: a `TypeError` about reading a property of `undefined` / `X is not a function` off the input, wrong argument count, Python `TypeError: ... missing N required positional argument(s)` / `unexpected keyword argument` / `takes N positional arguments but M were given`, or a Pydantic/zod validation error on the input itself. These usually fire on (almost) every item identically, because the cause is the signature, not the row.
   - `infraErrored`: `item.error` set for any other (DB/env/external-service-shaped) reason
   - `total`, `result.items.length`; `0` or non-zero exit code = whole-replay crash

   If `completed === 0`, do not score pass/fail on an empty set, branch to `check-replay-health`. Carry `shapeErrored` forward so `check-replay-health` routes shape mismatches to input adaptation instead of burying them as infra noise.
6. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Route on the counts and exit code.** Goal: keep infra noise out of evaluation. Read a sample of `item.error` strings (and stderr on crash) first to identify the DB-shaped pattern (missing record, FK / unique constraint, write rejected, connection refused, missing env).

   **If the errors are signature/shape mismatches (`shapeErrored`), that is NOT an infra problem**: it has its own route below (`adapt-replay-inputs`), which maps the recorded inputs onto the function's current signature. The DB/infra guidance in the rest of this step applies only to environment-shaped failures.

   **🚨 Do not silently work around DB issues.** Do not drop affected trace IDs, stub the read in the script, gate writes behind a script-only flag, wrap the function in a rollback transaction, or edit the instrumented function to skip DB calls. Those all hide infra problems as fake passing or fake failing results and corrupt the experiment.

   **Instead: tell the user what's wrong and offer exactly two workarounds.** Use use `AskUserQuestion` to surface a clear summary first, the failing trace ID(s), the error pattern, the function and span where it happens, then present the two options below. Pick a representative failing trace and call `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "summary"` to read its `environment` field (production / staging / development), so option B can name the source environment concretely.

   - **Workaround A: `mockOnReplay`** *(recommended for spans whose side effects shouldn't run during experimentation)*, apply the `mockOnReplay` recipe from step `replay-against-dataset` above (find the failing span, add `mockOnReplay: true` to its `SpanOptions`, re-run with `{ mock: "marked" }`). Edit only the span options, never the function body. Use this when the span is a DB read/write the experiment isn't testing and the captured output can stand in for it.
   - **Workaround B: Point replay at the trace's source database**: the trace's `environment` field names where it was captured (e.g. `production`). Tell the user that's the only environment whose DB has the rows the trace references, then offer to (i) update the replay env to point at that environment's DB (env vars, connection string) or (ii) ask which environment they want to use if multiple are valid. Apply the change to env / config, not to the function under test.

   After whichever workaround the user picks, re-run `replay-against-dataset` and re-check health. If the user can't or won't do either, stop and report, don't fabricate a workaround on your own.

   - **errors are shape mismatches, not infra (`shapeErrored` dominates the errored items: the recorded inputs don't fit the function's current signature)**: the function's shape drifted since these traces were captured, so replay can't call it with the recorded inputs. This is recoverable: route to `adapt-replay-inputs` to map the recorded inputs onto the current signature, then re-run → step 7
   - **whole replay crashed (non-zero exit, total is 0, or no parseable ReplayResult file/stdout fallback)**: show stderr / exit code, diagnose, confirm a script fix with the user, apply, loop back to `replay-against-dataset` → step 5
   - **every item errored with INFRA errors (completed is 0, total non-zero, and the errors are NOT predominantly `shapeErrored`, those take the shape-mismatch branch above)**: systemic infra failure (usually env mismatch). Diagnose, confirm a script fix with the user, loop back → step 5
   - **high INFRA error rate (over half of items errored, and `shapeErrored` is not the dominant cause, shape mismatches take the branch above)**: signal is noisy. Flag the rate and ask the user whether to fix the env and retry, or proceed with the partial signal → step 8
   - **healthy or mixed run (at least one completed item, infra errors at most half of total)**: proceed. Carry `infraErrored` forward, surface as its own bucket in the final report (the share-results step, or the benchmark scorecard's Unreplayable row in `benchmark` mode), never folded into pass/fail → step 8
7. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **The recorded inputs don't fit the function's current signature.** Replay pulls each trace's inputs exactly as they were captured against the signature AT TRACE TIME, then spreads them into the live function. When the shape drifted since capture, that spread throws (the `shapeErrored` items from `replay-against-dataset`). The fix is an **input adapter**: a per-trace transform, applied inside the SDK between fetch and call, that reshapes the recorded inputs onto the current signature so replay can run. It is the SDK's `adaptInputs` hook (TypeScript `replay({ adaptInputs })`) / `adapt_inputs` argument (Python `replay(adapt_inputs=...)`). You author the transform; the SDK applies it.

   **Step 0: confirm the capability.** Check the `supportsInputAdapters` flag from `detect-replay-capabilities` (the installed SDK accepts the `adaptInputs` / `adapt_inputs` option on `replay()`). If true, go to Step 1. If false, the installed SDK predates the input-adapter hook: tell the user to upgrade the SDK and re-run the assistant, and for this run take the **decline** branch below (these traces can't be validated without the hook). Do not hand-roll the reshape inside the function under test.

   **Step 1: reuse a committed adapter if one already covers this shape (re-ask only on drift).** Adapters live in their own file next to the replay script, imported by it (recommended: TS `scripts/replay-adapters/<name>.ts`, Python `scripts/replay_adapters/<name>.py`, Ruby `scripts/replay_adapters/<name>.rb`; plus an optional sibling `<name>.inputs.json` for judgement cases). If such an adapter already exists AND maps the current recorded shapes onto the current signature (sanity-check it against a sampled input below), do not re-prompt: just confirm the replay script imports it (Step 5) and re-run. Only when the signature has drifted past what it handles do you propose a new/updated mapping and re-confirm.

   **Step 2: learn the actual captured shape(s).** Pick a few `shapeErrored` trace IDs and call `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "full"` to read their recorded inputs. Sample MORE than one: the trace set can span several historical signatures (the function may have drifted more than once), so the adapter must tolerate each shape it actually sees, not just the newest old one. Then read the function's CURRENT signature from the code.

   **Step 3: decide mechanical vs judgement.**
   - **Mechanical** (rename, reorder, positional-to-options-object, drop a removed param, supply a literal/default): expressible as a pure function. Prefer this.
   - **Judgement** (the new shape can't be derived by rearrangement, e.g. one freeform field must be split into two based on its content): do NOT call a model from inside the adapter at replay time (that makes replay slow and non-deterministic). Instead, materialize up-front: YOU compute the adapted inputs for each affected trace now, once, and write them to the sibling `<key>.inputs.json` table keyed by the original Bitfab trace ID. The adapter then just looks the trace up.

   **Step 4: confirm, then write the adapter co-located with the replay script.** Use use `AskUserQuestion` to show the concrete mapping (old shape -> new shape) and get a yes before writing. On yes, write:
   - The adapter function. It receives the recorded inputs and a per-trace context (`{ traceId, sourceSpanId }` in TS; `{"trace_id", "source_span_id"}` in Python) and returns the args actually passed to the function. Make it **shape-dispatching**: branch on the input it actually receives so it normalizes each historical shape in the sample, not only one. For judgement cases, look up `<key>.inputs.json` by `traceId` first, then fall back to the mechanical branch.
   - **Faithfulness is non-negotiable.** If the current signature has a genuinely new REQUIRED input with no analog in the recorded trace, do NOT invent a value. Leave those traces unmapped; they go in the decline bucket below with a stated reason. Adapting must never silently fabricate test inputs.
   - These files are committed (they sit next to the replay script, in source control), so they persist across runs and are reviewable in the PR.

   **Step 5: wire it in and re-run.** Write the adapter to its own file next to the replay script (TS `scripts/replay-adapters/<name>.ts` exporting `adaptInputs`; Python `scripts/replay_adapters/<name>.py` defining `adapt_inputs(args, kwargs, ctx)`; Ruby `scripts/replay_adapters/<name>.rb` defining an adapter lambda). Then edit the replay script to import it and pass it to this pipeline's `replay()` call as `adaptInputs` / `adapt_inputs` (see the Replay section for the exact import shape). Editing the replay script here is expected. Loop back to `replay-against-dataset`, re-run, and confirm the `shapeErrored` items cleared.

   - **an adapter is in place (user approved a new mapping, or a persisted adapter already covers the current shape) and the replay script loads it**: re-run with the adapter applied. Loop back to `replay-against-dataset` → step 5
   - **the SDK lacks the hook (`supportsInputAdapters` false), the user declines adapting, or some inputs can't be faithfully mapped (new required input with no analog)**: do not fabricate inputs. Carry the unmappable `shapeErrored` trace IDs as their own **shape-incompatible** bucket (each with a one-line reason), distinct from infra errors and never scored pass/fail/regression, and surface it in the final report (share-results, or the benchmark scorecard's Unreplayable row). If any items DID complete (partial adaptation), proceed to evaluate them; otherwise this is a terminal report path → step 8
8. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Route on whether replay trace IDs are available.** Check the `hasTraceIds` flag from `replay-against-dataset` (this confirms the tentative `supportsReplayTraceIds` flag from `detect-replay-capabilities`). This determines whether verdicts can be persisted to the server and whether the experiments page in Studio will show meaningful results.

   - **replay trace IDs are populated (`hasTraceIds` is true)**: the SDK and server support trace ID mapping. In non-benchmark modes, open the experiments page in Studio first (so the user can watch verdicts populate in real time), then evaluate and persist labels. In `fix` mode with `fixReplayScope = "single-trace"`, the replay has an experiment group but do not open Studio yet; `open-experiments` self-skips so the single trace can be evaluated and persisted first, then `fix-target-replay-status` branches on whether the target passed or failed. In `benchmark` mode without the `studio` flag no Studio is open, so `open-experiments` self-skips: go straight to evaluating and persisting labels. In `benchmark` mode with the `studio` flag, `open-experiments` behaves like other modes → step 12
   - **replay trace IDs are null (`hasTraceIds` is false)**: tell the user: "Your SDK doesn't support replay trace IDs, so experiment results can't be persisted to Studio or compared across iterations. Upgrade your SDK and run `/bitfab:setup replay` to regenerate the script. Evaluating in-agent for now." Then proceed to text-only evaluation so the user still sees comparison results in-agent, without the Studio experiments page → step 9
9. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Evaluating results"`.

   **Run only when replay trace IDs are unavailable** (`hasTraceIds` is false, you were routed here from `check-trace-id-support`; if trace IDs are available, use `evaluate-results` instead). **Evaluate results in-agent without persisting.** The agent still compares original vs new outputs and derives pass/fail verdicts, but cannot persist them via `persistReplayLabels.js` or show them in Studio. This is a terminal path: it does NOT continue to `evaluate-results` or `verify-replay-labels`; its `next` goes straight to the report (share-results, or the benchmark scorecard).

   If `replay-against-dataset` already consumed a non-empty run `events.jsonl`, reuse that progress-derived work and any verdicts already produced from item files referenced by progress rows. Successful progress events identify which original traces settled, and failed events already define unreplayable candidates. Do not reclassify those failures as output regressions. If the progress file is missing or empty, fall back to the completed replay output; this is expected for old SDKs or replay scripts without `onProgress`. Since there are no server replay trace IDs on this path, all verdicts here stay in working context only.

   For each completed (non-errored) replay item, derive a verdict by comparing the replay's new output against the original trace's label and annotation:

   - **fail**-labeled original: does the replay's new output address the annotation? If yes, mark as PASS. If no, mark as FAIL.
   - **pass**-labeled original: preserved means PASS, regressed means FAIL.
   - Unreplayable items (`item.error` set) go in their own bucket.

   Hold the verdicts in working context for the final report, the `share-results` step in `wizard`/`dataset`/`experiment`/`investigate` modes, or the **benchmark scorecard** in `benchmark` mode. This step's `next` routes there directly: it does NOT run the `evaluate-results` (persist) or `verify-replay-labels` steps. Since trace IDs are unavailable, do NOT attempt to run `persistReplayLabels.js` or open the experiments page; the report is the terminal step from here.

   **Next:**

   - Mode `wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`: continue below in this skill.
   - Mode `benchmark`: invoke the `assistant-benchmark` skill with mode `benchmark`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
10. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Evaluating results"`.

   **Evaluate against labels & annotations.** Score only items where `item.error` is unset. Items with `item.error` set are unreplayable (already classified) and go in their own bucket, never pass, fail, or regression.

   > 🚨 **MANDATORY, NOT A JUDGMENT CALL:** Reaching this step means replay trace IDs are available, so you MUST derive **and persist** a verdict (or one of the three explicit non-verdicts below) for **every** completed (`item.error` unset) replay item. `item.error` unset means "score this item against its criteria", it does NOT mean "it passed". Persisting is not optional, you do not get to decide a run "isn't worth scoring", "looks like noise", or "would pollute the dataset" and jump to the report with an empty scorecard. There is no "this whole run isn't meaningful, so skip labeling" path: that path does not exist, and `verify-replay-labels` will route you back if the persisted set doesn't cover every completed item.

   **The verdict is decided by the output against its criteria, never by your opinion of how informative, useful, or production-like the run is.** Environmental doubts, a mock/stub model, no real gateway, flaky infra, an output that "looks like noise", a worry that the labels would pollute the dataset, are **caveats only**: write them into the `annotation` and lower the `confidence` (e.g. `Low` / `VeryLow`). They never suppress a verdict and never skip this step. A low-confidence verdict with a caveat is still a verdict and still gets persisted.

   **Finalize the live evaluation loop; do not start from scratch.** If `replay-against-dataset` produced a non-empty run `events.jsonl`, read it before judging and reuse any prep, unreplayable buckets, verdicts, and persisted server replay trace IDs already produced during the running replay. Each progress event's `item.traceId` is the source/original trace id; use it to identify which dataset item settled. Enriched progress rows carry `item.replayTraceId` and `item.itemPath`; the item file has the full input, replay output, original output, and metadata needed to judge during replay. Progress-only rows are only a trigger/prep signal. If the file is missing or empty, continue from the final complete event; older scripts remain valid and simply do not get incremental evaluation. The final verdict still comes from the completed replay item files / experiment trace data, and persistence is still keyed by the **server replay** trace id.

   When possible, evaluate and persist in small completed batches rather than waiting to judge every item at once: every time a progress event gives you a replay item ref with a replay trace id, full item file, and its original label/annotation, read the item file, derive that item's verdict, and append it to the pending verdict set. Once a batch has complete coverage for its expected replay trace ids, call `persistReplayLabels.js` for that batch. If the current replay script/SDK only exposes replay outputs at the end, use progress during the run for preparation and failed-item bucketing, then do the first persist immediately after this run's `complete` row appears. At the end of the replay, run the same coverage gate over the complete row's item refs; any item not already persisted must be judged and persisted before continuing. This keeps Studio's experiment view filling in as early as the available data allows while preserving the same final correctness checks.

   For each completed (non-errored) replay item, derive a verdict by comparing the replay's new output against the original trace's label and annotation (from Phase 3 in `wizard`/`dataset` modes, loaded by `pick-dataset` in Phase 5 Setup in `experiment` and `benchmark` modes; in `fix` mode's single-trace pass, the failure annotation held from Phase Fix `resolve` is the criterion, and on a later full-dataset run the added trace plus any pre-existing dataset siblings loaded by `fix-add-to-dataset`):

   - **fail**-labeled original: does the replay's new output address the annotation? If yes → `label: true` (PASS). If no → `label: false` (FAIL). Use the annotation as the acceptance criterion.
   - **pass**-labeled original: preserved → `label: true` (PASS). regressed → `label: false` (FAIL).

   **The ONLY permitted non-verdicts for a completed item are these three enumerated skip cases.** Each is per-item and must be accounted for explicitly with a `{skip: true}` entry. Nothing else, and never "the whole run isn't worth scoring", justifies omitting a completed item:

   - **Unlabeled original** (no validated or agent label, possible in `benchmark` mode, where the dataset only needs ≥1 trace regardless of label mix): there is no acceptance criterion to score against, so do NOT pass/fail it. Mark it `skip: true` and note "unlabeled, no expected result", it counts toward `S` (skipped) and is excluded from `scorable`, never pass or fail.
   - **Fail-labeled original with an unusable annotation** (the label exists and says FAIL, but the annotation is empty or contentless, e.g. "bad", "wrong", "fix this", so it states no criterion for what "fixed" looks like): the fail label tells you the direction but not what to check the new output against. This skip is narrow and applies ONLY when BOTH hold: (a) the original is **fail**-labeled (a pass-labeled original never needs the annotation, you score it by preserved-vs-regressed against the original output, so this case does not apply), and (b) you **cannot reconstruct the defect** from the code, the function's intent, or the original's own output. If you can recover what was wrong from any of those, you have a criterion, so verdict it (a thin-but-usable annotation like "returns null instead of the email" is NOT unusable). Only when the criterion is genuinely unrecoverable: `skip: true` and note "fail label, annotation states no checkable criterion". This is not an escape for annotations you simply find terse or inconvenient.
   - **Genuinely ambiguous output** (you read the output and the code and still cannot judge it, not laziness, not an environmental doubt, which is a caveat above, not a skip): `skip: true` instead of guessing. Skips are recorded explicitly so the verify step knows you intentionally did not verdict.

   **Unreplayable items** (`item.error` set) are not completed items at all, so they are excluded from the scope above and are NOT verdicted here (no `{skip: true}` entry either). Keep their list (trace ID + error string) for the final report (the `share-results` step in `wizard`/`dataset`/`experiment`/`investigate` modes, or the benchmark scorecard's Unreplayable row in `benchmark` mode). Carry the skipped list forward the same way.

   **When `costRun` is set, also capture the token delta for each completed item.** The run's goal is fewer tokens, so a verdict is not finished without the cost direction. **First make sure each original's recorded token usage is actually in your context.** It normally arrives with the dataset load, but if build-dataset loaded this dataset via `mcp__plugin_bitfab_Bitfab__read_trace_labels` (`costRun` was false at build time and only flipped on afterward), that load carried labels but no token usage: read the dataset's original trace IDs once by running `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" <trace-id...> --scope summary` (`summary` is enough for the token totals) and `Read` the `outputFile` it prints, before computing deltas. This is a cheap read, not a re-replay, so do it before the missing-usage recovery ladder below. Then compare each original trace's recorded token usage against the replay item's `tokens` from the replay output: per item, record input and output tokens baseline (original) vs new (replay) and the % change. Carry the per-item deltas plus the dataset totals (baseline vs new input/output tokens and overall % change) forward for the report. A pass that costs more tokens is a cost regression even when the output is still correct: flag it rather than burying it under a green verdict. (If the replay output reports only total tokens, report the total delta; if it splits input and output, report both.) **Compute the delta on the basis the run carries (`costBasis`), so the chat numbers match the page lens.** On `costBasis = uncached`, subtract each side's cached input first: the per-side figure is `(input - cached) + output`, taking `cached` from the original's recorded usage and from the replay item's `tokens` (which carries `input`, `output`, and `cached`), and label the reported figures "uncached" so they read the same as the cyan/orange page trend. An item with no cached tokens then equals `input + output` on its own, exactly as the page shows it. On `costBasis = all` (the default), report `input + output` with no subtraction. Carry the per-item figures forward already on the chosen basis so `share-results` and the scorecard inherit it without re-deciding.

   **Never run a separate baseline replay arm.** The baseline is the original traces' recorded usage, full stop. There is exactly one replay per item (the changed-code arm). Do not replay the original/unchanged code to "establish a baseline"; the original trace already is that measurement. The only exception is the missing-usage recovery below, and even that re-runs only the affected items, never the whole dataset.

   **Handle originals that aren't a usable baseline.** An original trace is not a trustworthy baseline if it errored, has a failed or incomplete status, or recorded no token usage. In any of those cases its numbers don't reflect a clean run of the unchanged code. Re-replaying the unchanged code is expensive and is the LAST resort, never the first move. For each such item, walk this order and stop at the first step that yields a baseline:

   1. **Reuse a recorded run.** Check whether any other already-recorded trace or prior replay of the same item ran the unchanged code cleanly and has usage (e.g. an earlier good trace for the same input, or a prior baseline from an earlier iteration). If so, use it. No new run.
   2. **Backfill only the truly unrecoverable items.** Only if no clean recorded usage exists anywhere for that item, re-replay the unchanged code for that one item.

   Keep re-replays to the minimum: only items that fail step 1, one replay each, never a full baseline arm across the dataset. If even step 2 errors or yields no usage, report that item's delta as uncomputable ("no baseline, original did not complete cleanly") instead of guessing.

   **The verdict you produce here is persisted onto the REPLAY trace IDs (not the originals).** That's what makes "did this fix actually pass on replay?" queryable across iterations.

   **Scale the judging with fan-out when there are many items.** Per-item judging is embarrassingly parallel: each verdict depends only on that one item's own artifacts (plus the fixed rubric and any shared context you gather once below), never on the other items, and the judge only reasons and returns JSON, it never edits files. So pick serial or fan-out by the item count:

   - **At or below ~15-20 items: stay serial.** Judge every item yourself, inline in this agent, exactly as described above. Below that threshold the subagent spawn overhead outweighs the parallelism, so serial is faster.
   - **Above ~15-20 items: fan out.** Split the items into batches (aim for one batch per subagent, roughly 8-12 items each, so even a large dataset resolves in a handful of subagents) and spawn one read-only subagent per batch with the Agent tool, `subagent_type: "general-purpose"`. Each subagent reasons over the payloads you hand it and returns its batch's verdicts as JSON. These judges only read and return data: do **NOT** pass `isolation: "worktree"` and do **NOT** depend on bypass permissions (that gating is only for the code-editing experiment fork in `pick-execution-mode`). A judge never edits files, runs replay, opens Studio, or calls MCP tools.

   Make each subagent prompt fully self-contained: its batch's per-item payloads (each item carries its own artifacts, enumerated below), the fixed rubric, and any shared context you gathered once (so no subagent re-derives it or touches the repo). Tell it to return one verdict entry per item in the exact shape this step persists, and nothing else.

   **Then collect and persist once.** Wait for every batch, concatenate their verdict arrays into the single full set covering all items, and make the one batched persist call this step already describes, unchanged. Fan-out changes only how you produce the verdicts, never how they are stored or routed: same call, same shape, same buckets, same downstream steps.

   **Per-item inputs for this step (however you produce the verdicts):** each completed replay item's own artifacts, the original trace's input, its original output, its label and annotation, and the replay's new output (and, when `costRun` is set, the original's recorded token usage plus the replay item's `tokens` for that item's baseline-vs-new token figures). The fixed rubric is exactly the fail-labeled / pass-labeled / unlabeled / ambiguous rules above, and each verdict is keyed by the **replay** trace ID in the shape below (`{ traceId, label, annotation, confidence? }` or `{ skip: true }`). When you fan out, each subagent's prompt carries its batch's per-item inputs and returns that batch's verdict entries, which you concatenate into that batch's `verdicts` array. However the verdicts are produced, you keep the unreplayable (`item.error`) and skipped buckets exactly as above, apply `costBasis` and roll up the dataset token totals yourself (those are cross-item and stay with you), then persist each complete batch with `persistReplayLabels.js` and keep a set of replay trace IDs already persisted. The final full-run coverage check below must account for every completed replay trace exactly once.

   **Exception that overrides the fan-out block above, parallel-worktree experiment mode:** if you ARE the worktree subagent running this experiment (parallel mode from `pick-execution-mode`), ignore the serial-vs-fan-out count rule and judge your items inline regardless of count, a subagent does not spawn its own judging subagents. Then hand the collected result back to the main agent as described below. The fan-out block above governs only when this step runs in the main agent itself: serial execution, benchmark, or the wizard / dataset / investigate modes.

   **Persist via `persistReplayLabels.js`.** Write verdicts to a tmp JSON file then run the script. You may do this incrementally for complete batches as replay results arrive, and again at the end for any remaining replay trace IDs that were not already persisted. Each call is one batched MCP write; the script parses `update_agent_labels`'s agent-readable effective label lines internally before deleting the file, and its JSON status is the gate you route on:

   1. Pick an **absolute** tmp path. The script reads the file relative to its own process cwd, which in parallel-worktree mode is NOT the project root, so a relative path can resolve to a different directory than where you wrote the file (`ENOENT`). Recommended: `<repoRoot>/.bitfab/tmp/verdicts-<testRunId>.json` where `<repoRoot>` is the output of `git rev-parse --show-toplevel` (create the dir if missing). Falls back to an absolute path under `os.tmpdir()` if the project root isn't writable.
   2. Use the `Write` tool to write JSON of this exact shape:

   ```json
   {
     "expectedTraceIds": ["<replayTraceId1>", "<replayTraceId2>", "..."],
     "verdicts": [
       { "traceId": "<replayTraceId1>", "label": true, "annotation": "Now returns the missing field; original annotation said it was empty.", "confidence": "High" },
       { "traceId": "<replayTraceId2>", "label": false, "annotation": "Output still hallucinates a tool argument.", "confidence": "VeryHigh" },
       { "traceId": "<replayTraceId3>", "skip": true }
     ]
   }
   ```

   `expectedTraceIds` MUST be the full set of REPLAY trace IDs covered by this call's batch (and across all batches, every completed `item.error`-unset replay trace must be persisted exactly once, no fewer, per the mandatory-coverage rule above). For the final end-of-run call, use only the remaining completed replay trace IDs that were not already successfully persisted by an earlier batch. `verdicts` MUST have one entry per ID, either a `{label, annotation, confidence?}` verdict or a `{skip: true}` explicit skip (skips allowed only for the three enumerated skip cases above, never for an environmental doubt). `confidence` is optional but recommended (`VeryLow|Low|Medium|High|VeryHigh`); it surfaces in the labeling UI so reviewers can prioritize low-confidence verdicts. If verdict counts don't match `expectedTraceIds`, the script returns `status: "missing-coverage"` and the verify step routes you back to fill the gaps.

   3. Run the script:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/persistReplayLabels.js" <repoRoot>/.bitfab/tmp/verdicts-<testRunId>.json
   ```

   4. Read its single JSON line on stdout. Hold the parsed result for the next step.

   **Spill working notes to a separate tmp file if context gets big.** Don't conflate working notes with the verdicts file, the script deletes the verdicts file on success.

   **If you're a worktree subagent** (parallel mode from `pick-execution-mode`): after the script returns, hand the parsed result + `testRunId` + unreplayable list back to the main agent and exit. The main agent collects results from all parallel experiments before `open-experiments`.
11. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Verify replay labels persisted.** Route on the `status` field of the JSON the script printed in `evaluate-results`. The script is the deterministic gate, if it didn't return `ok`, the agent's verdicts are NOT yet on the replay traces and the experiment delta will be wrong on the next iteration.

   **This is the hard gate into the report: `share-results` and the benchmark scorecard are unreachable without a `status: "ok"` here.** `status: "ok"` only proves the script's `expectedTraceIds` were all verdicted; it does NOT prove you handed the script every completed item. Before you treat `ok` as a pass, **cross-check the coverage yourself**: `persistedTraceIds` (plus the `item.error` unreplayable bucket) MUST account for every item in the replay output. If any completed (`item.error` unset) replay item is missing from the persisted set, you under-scoped `expectedTraceIds` (most often by deciding the run "wasn't worth scoring") and the scorecard would be silently empty or partial: go back to `evaluate-results`, rebuild the verdicts file covering ALL completed items, and re-persist before routing onward.

   - **`status: "ok"` AND `persistedTraceIds` (plus the unreplayable `item.error` bucket) account for every completed replay item**: labels are persisted on the replay traces and the verdicts file is gone. In `benchmark` mode continue to the benchmark scorecard (a terminal report, no iteration); in all other modes continue to share-results (experiments page was already opened before evaluation) → step 13 (mode `fix`); the `assistant-benchmark` skill (mode `benchmark`); stop (mode `add-trace` or `replay`); otherwise step 20
   - **`status: "ok"` but a completed (`item.error` unset) replay item is absent from `persistedTraceIds` (your own coverage cross-check failed: `expectedTraceIds` was under-scoped)**: the script passed only because you handed it a truncated `expectedTraceIds`; the report would be silently empty or partial. Go back to `evaluate-results`, rebuild the verdicts file so `expectedTraceIds` is the full set of completed replay items, and re-persist. Do NOT proceed to the report → step 10
   - **`status: "missing-coverage"` (script returned a non-empty `missingTraceIds` array)**: you under-verdicted. Read the missing replay trace IDs (run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" <trace-id...> --scope full` and `Read` its `outputFile` if you didn't already, since you are persisting pass/fail verdicts on their span content), decide each one (PASS / FAIL with annotation, or `skip: true` if genuinely ambiguous), write a NEW verdicts file at the same path covering ALL the originally expected IDs (the script needs the full `expectedTraceIds` list each call, not just the gaps), and re-run the script. Loop back here with the new result → step 11
   - **`status: "invalid-input"` (malformed verdicts JSON or missing fields)**: the verdicts file you wrote doesn't match the schema. Read the script's `message` field, fix the JSON (most common: missing annotation on a non-skip entry, missing traceId, expectedTraceIds empty), and re-run the script. Loop back here → step 11
   - **`status: "mcp-error"` (MCP call to update_agent_labels failed mid-batch, including invalid trace IDs)**: Read the script's `message` field. If it says the trace IDs are invalid or not in this organization, you likely used local replay trace IDs from item files; call `mcp__plugin_bitfab_Bitfab__get_replay_status`, rebuild the verdicts file with the mapped server replay trace IDs, and re-run the script. For network or auth errors, the script's `partialTraceIds` lists which IDs were already persisted; tell the user, recommend re-running the script (it's idempotent, already-persisted labels just upsert), and loop back here. If it keeps failing, stop and surface the error → step 11
   - **`status: "verification-failed"` (the readable write result did not show the expected labels)**: the write returned but the `update_agent_labels` output did not include the expected effective label lines for the replay traces. Do NOT report a scorecard. Read the script's `message`, `missingTraceIds`, and `mismatchedTraceIds`, rerun the same verdict file after fixing the issue if needed, and loop back here. If it keeps failing, stop and surface the verification details → step 11

   **Next:**

   - `status: "ok"` AND `persistedTraceIds` (plus the unreplayable `item.error` bucket) account for every completed replay item (mode `wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`): continue below in this skill.
   - `status: "ok"` AND `persistedTraceIds` (plus the unreplayable `item.error` bucket) account for every completed replay item (mode `benchmark`): invoke the `assistant-benchmark` skill with mode `benchmark`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
12. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark` or `fix`.**

   **Open experiment viewer (fallback).** This step only runs when replay trace IDs are available (routed here from `check-trace-id-support`). If no `testRunId`s were captured, skip this step and continue to evaluate.

   **In `fix` mode with `fixReplayScope = "single-trace"`, skip this step entirely.** Studio should not open automatically for the targeted first replay, even though the replay is tagged with `fixSingleTraceExperimentGroupId`. Continue directly to `evaluate-results`; after labels are persisted, `fix-target-replay-status` branches on whether the target passed or failed before asking what to do next.

   **In `fix` mode with `fixReplayScope = "dataset"` and `fixDatasetStudio` false (the user chose a terminal-only re-run), also skip this step entirely** (no Studio is open). Continue to `evaluate-results`; the dataset results are reported in chat by `share-results`.

   **In `benchmark` mode without the `studio` flag, skip this step entirely** (no Studio is open). With the `studio` flag, benchmark behaves like the other modes below: skip if the experiments page was already opened via `experimentGroupId` in `open-experiments-before-replay`, otherwise navigate with the collected `testRunId`s. Either way this step's `next` goes to `evaluate-results`, which in benchmark mode scores the items, persists verdicts, and then routes to the terminal benchmark scorecard. (The numbered position of this step in the rendered list does not reflect run order: follow the `next` routing, not the list sequence.)

   If the experiments page was already opened via `experimentGroupId` in `open-experiments-before-replay` (`supportsExperimentGroups` is true), skip this step entirely, the page is already showing live results.

   If `supportsExperimentGroups` is false, navigate Studio to the experiments page. Build the path with **every** `testRunId` you've collected across iterations of this phase (comma-separated):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio/experiments?testRunIds=<testRunId1>,<testRunId2>,<testRunId3>"
   ```

   In `benchmark` mode (with the `studio` flag), append `&mode=benchmark` here too so the page shows benchmark terminology. Likewise, when `costRun` is set (classified in argument routing; see the token-cost lens note in `open-experiments-before-replay`), append the token-cost suffix (always with an explicit basis) so the token-cost columns show: `&tokens=1&tokenType=all` for `costBasis = all`, or `&tokens=1&tokenType=uncached` for `costBasis = uncached`, e.g. `/studio/experiments?testRunIds=<testRunId1>,<testRunId2>&tokens=1&tokenType=uncached`. The command navigates an existing session or opens a new one automatically.
13. **Run only when mode is `fix`.**

   **Run only in `fix` mode.** This step is reached after replay verdicts were evaluated for a fix run.

   Route on the replay scope and the targeted trace's result. This split matters: if the targeted experiment failed, do not present "run full dataset" as the normal next step. The useful next action is usually to inspect the before/after or keep iterating on the target trace.

   - **`fixReplayScope = "dataset"` (the user already chose the full-dataset experiment)**: continue directly to share-results → step 20
   - **the targeted single-trace replay verdict is PASS (`label: true`)**: the target trace went green. Now add it to a dataset, then ask whether to re-run the full dataset, inspect the before/after, keep iterating, or stop → step 14
   - **the targeted single-trace replay verdict is FAIL (`label: false`), skipped, unreplayable, shape-incompatible, or could not be persisted because replay trace IDs were unavailable**: the fix did not prove the target trace green this pass. If `fixAddedToDataset` is not set, nothing is in a dataset yet; if it IS set (an earlier pass already added the trace to the dataset and a later iteration regressed it), the saved dataset trace is still there and this iteration just regressed it. Ask whether to inspect the before/after, keep iterating, or stop → step 17
14. **Run only when mode is `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Adding the scenario to a dataset"`.

   **Run only in `fix` mode, reached after the targeted single-trace replay passed.** This step offers to save the now-green scenario to a dataset with a validated failing label so it guards against regressions. It is **re-entered** whenever the passed prompt loops back (the user opened the before/after, or kept iterating and the trace passed again), so it must prompt and add the trace exactly **once**.

   **Idempotency guard, check this first.** If you already resolved the dataset choice earlier in this fix session, do **not** re-ask, re-label, re-pick, or re-attach: skip straight to `fix-single-trace-passed`. The choice is resolved when `fixAddedToDataset` is set (a `datasetId` is held and the target trace is attached to it: a permanent decision) or `fixDatasetSkipped` is set (the user chose to continue without saving on this pass). `fixDatasetSkipped` is a **per-pass** decline, not permanent: the "Keep iterating" branch of `fix-single-trace-passed` clears it, so a later green replay re-offers the save prompt (the option only declines saving *now*). Only run the steps below when neither flag is set.

   **Otherwise ask the user where to save this scenario.** This is the only place the fix flow decides dataset membership, so **always ask** so the user sees what's happening and stays in control, but **keep the prompt to at most four options, never one option per dataset** (that overflows the picker and overwhelms the user once a few datasets exist). First, if the user named a specific dataset ID in their invocation, skip the prompt and use it (confirm it's scoped to this function via `mcp__plugin_bitfab_Bitfab__list_datasets`; if it belongs to a different function, `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` would silently skip every trace, so use `AskUserQuestion` and offer a correctly-scoped dataset instead). Otherwise call `mcp__plugin_bitfab_Bitfab__list_datasets` with the function key and present via `AskUserQuestion`, choosing options by how many datasets exist:
   - **Add to `<recommended>`** — the single most recently used dataset that has traces, marked recommended. **Omit this option only when no dataset exists yet.**
   - **"Choose a different dataset"** — **include this only when two or more datasets exist** (with exactly one, the first option already covers it), and place it **right after** the recommended dataset so the two dataset-picking choices sit together. On pick, present a second via `AskUserQuestion` listing existing datasets scoped to this function (name · id · count, most recently used first, capped to what the picker holds) so the user can route to a specific one.
   - **"Create a new dataset"** — on pick, silently call `mcp__plugin_bitfab_Bitfab__create_dataset` with `traceFunctionKey: <key>` and `name` set to `<key>` when none exist yet, else `"<key> #N"` (N one more than the existing count); don't ask for a name. Mark this recommended when no dataset exists yet.
   - **"Continue without adding"** — the user declines to save this scenario now. Set `fixDatasetSkipped = true`, do **not** label or attach anything, and continue to `fix-single-trace-passed`.

   So the prompt is **two** options when none exist yet (Create a new dataset · Continue), **three** with a single dataset (Add to it · Create a new dataset · Continue), and **four** with several (Add to the recommended one · Choose a different dataset · Create a new dataset · Continue).

   Once a dataset is chosen (existing or newly created), save the scenario, in order:

   1. **Label the original trace as a validated fail.** Using the failure annotation you wrote in Phase Fix `resolve` (what the original output got wrong and what correct behavior is), call `mcp__plugin_bitfab_Bitfab__set_human_labels` once with `[{ traceId, label: false, annotation }]` on the **original** trace. This records a **validated human verdict** (not an unapproved agent suggestion), so the trace counts as a real regression test the instant it's written, with no Studio approval step. Use `label: false` because the original output was the bug; the fix is what now turns it green on replay. (On the rare occasion the user is adding an already-*passing* trace to guard against future regressions, use `label: true`.)
   2. **Attach the trace.** Call `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` with the `datasetId` and `[traceId]` (idempotent, a safe no-op if already present). **Confirm the attach landed**: the trace is in the dataset when it was added now or was already present. If the tool reports it skipped the trace (e.g. a scope mismatch), do **not** claim it was added or set `fixAddedToDataset`, re-pick a dataset scoped to this function and attach again before continuing.
   3. **Record whether the dataset has siblings, and load their labels if so.** Note whether the dataset already held other traces besides the one you just attached, and hold that as `datasetHasSiblings` (the next step uses it to decide whether re-running the whole dataset is meaningful). If there **are** siblings, the user may next choose to re-run the full dataset, so run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" <trace-id...> --scope full` over the dataset's trace IDs and `Read` the `outputFile` it prints, so every sibling's validated label + annotation is in context for that experiment. **Skip the load** when you just created the dataset or it held only this trace (no siblings).

   Set `fixAddedToDataset = true` (only once the attach above is confirmed) so any re-entry of this step skips the add-to-dataset work. Tell the user in one line that the now-passing scenario was added to dataset `<name>` (`<datasetId>`) with a validated failing label, so it is included whenever that dataset runs. Then continue to `fix-single-trace-passed`.
15. **Run only when mode is `fix`.**

   **Run only in `fix` mode when `fixReplayScope = "single-trace"` and the targeted replay passed.** `fix-add-to-dataset` has just resolved where the target trace goes: either it was added to dataset `<name>` (`<datasetId>`) with a validated failing label, or the user chose to continue without saving it (on a re-entry, that choice was made earlier).

   Report the result first. Lead with that the target trace went green; this pass intentionally did not run the rest of the dataset and did not open Studio. **Then state the save outcome by checking the flags:** if `fixAddedToDataset` is set, say it is now saved in dataset `<name>` with a validated failing label, so it guards against regressions whenever that dataset runs; if `fixDatasetSkipped` is set instead, say it was not added to any dataset (the user chose to continue). The replay labels have been persisted when trace IDs were available, so this fix is queryable on the replay trace.

   Then ask what to do next. One option always lets the user **show this fix in Studio** (the single-trace before/after). **Gate the full-dataset option on `datasetHasSiblings` (from `fix-add-to-dataset`, always false when the user continued without saving):**
   - **The dataset has sibling traces:** the headline choice is whether to re-run the entire dataset now to check the fix against every trace in it (you'll then ask Studio vs terminal-only). Present all four options below and recommend **"Re-run the entire dataset"**.
   - **No siblings** (the added trace is the dataset's only trace, or the user continued without saving so nothing was added): do **NOT** offer "Re-run the entire dataset", there is no other dataset trace to run, and re-running a one-trace dataset would just replay the trace you already proved green. Present only "Show in Studio", "Keep iterating", and "Stop and wrap up", and recommend **"Stop and wrap up"**.

   > A) **Re-run the entire dataset**: **Only include this option in the question when `datasetHasSiblings` is true; omit it entirely when the added trace is the dataset's only trace** (re-running a one-trace dataset just replays the trace you already proved green). When included, continue to `fix-rerun-dataset-mode`, which asks whether to run it in Studio or terminal-only before replaying the same code change across the full dataset → step 16
   > B) **Show in Studio**: open Studio to the targeted single-trace before/after experiment using `fixSingleTraceExperimentGroupId` (or `testRunIds` fallback), then ask this question again → step 19
   > C) **Keep iterating**: clear `fixDatasetSkipped` if it was set (this is a fresh attempt, so a later green should re-offer the save prompt the user declined only on the previous pass), set `fixReplayScope = "single-trace"`, set `fixSkipMakeChange = false`, and make another change against the target trace → step 3
   > D) **Stop and wrap up**: stop here and leave the dataset as it is: the saved trace stays if one was added (`fixAddedToDataset`), and nothing is saved if the user continued without adding (`fixDatasetSkipped`) → the `assistant-wrap-up` skill

   **Next:**

   - Option D (Stop and wrap up) (mode `fix`): invoke the `assistant-wrap-up` skill with mode `fix`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
16. **Run only when mode is `fix`.**

   **Run only in `fix` mode when the user chose "Re-run the entire dataset" from `fix-single-trace-passed`.** The same already-made fix will replay across every trace in the dataset. Ask whether to watch it live in Studio or run it terminal-only (results reported in chat). Either way, set `fixReplayScope = "dataset"` and `fixSkipMakeChange = true` (the fix is already made; this re-runs it across the dataset without editing again), then route to `open-experiments-before-replay`, which honors `fixDatasetStudio`.

   > A) **In Studio**: set `fixDatasetStudio = true`: open Studio to the experiment page and stream verdicts live as the dataset replays *(recommended)* → step 3
   > B) **Without Studio**: set `fixDatasetStudio = false`: run the dataset replay terminal-only and report the results in chat, with no Studio window → step 3
17. **Run only when mode is `fix`.**

   **Run only in `fix` mode when `fixReplayScope = "single-trace"` and the targeted replay did not pass.**

   Report the failed target result first. Say whether the replay produced a real FAIL verdict, was skipped as ambiguous, was unreplayable / shape-incompatible, or could not persist labels because replay trace IDs were unavailable, and that the original bug is not proven fixed this pass. **Get the dataset-state wording right by checking `fixAddedToDataset`:** if it is NOT set, nothing is in a dataset yet (the trace is added only once the fix proves the target green, unless the user explicitly saves a still-failing trace). If it IS set (an earlier pass already turned the trace green and added it to the dataset, then a later iteration regressed it), do NOT say "nothing saved", the trace is already saved in the dataset; say the saved trace just regressed and is red again.

   **Distinguish "the fix failed" from "couldn't even test it," because it changes the recommended next step:**
   - **Real FAIL verdict** (the replay ran and the output is still wrong): recommend **"Keep iterating"**, another code change is the right move.
   - **Unreplayable / shape-incompatible** (the replay couldn't run the trace, so the fix was never actually tested): another code edit won't help. Most of these were already routed to the replay-health remedies (`check-replay-health`, `adapt-replay-inputs`) before reaching here; if one still lands here, **do not recommend "Keep iterating"**. Point the user at making the trace replayable instead (adapt the recorded inputs onto the current signature, mock the failing span, or point replay at the trace's source DB), and recommend "Stop and wrap up" if they don't want to chase the environment now.

   Then ask what to do next. Offer inspection, another fix attempt, saving the trace as a failing test to revisit later, or stopping. Do not offer a full-dataset run here: there is no dataset trace to run unless it was already added earlier, and running one before the target passes would defeat the test-first add-to-dataset flow:

   > A) **Show in Studio**: open Studio to the targeted single-trace before/after experiment using `fixSingleTraceExperimentGroupId` (or `testRunIds` fallback), then ask the failed-result question again → step 19
   > B) **Keep iterating**: recommend this only when the replay produced a real FAIL (for an unreplayable / shape-incompatible result, recommend making the trace replayable or stopping instead, per the body). Set `fixReplayScope = "single-trace"`, set `fixSkipMakeChange = false`, and make another change against the target trace → step 3
   > C) **Save as a failing test**: add the still-failing trace to a dataset with a validated failing label anyway, so the diagnosed bug is saved to revisit later, then stop. Continue to `fix-save-unfixed` → step 18
   > D) **Stop and wrap up**: save nothing and report that the target is still not green → the `assistant-wrap-up` skill

   **Next:**

   - Option D (Stop and wrap up) (mode `fix`): invoke the `assistant-wrap-up` skill with mode `fix`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
18. **Run only when mode is `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Saving the failing scenario"`.

   **Run only in `fix` mode when the user chose "Save as a failing test" from `fix-single-trace-failed`.** The fix didn't prove out, but the user wants to keep the diagnosed failing scenario so they can come back to it. Add it to a dataset with a validated failing label exactly as `fix-add-to-dataset` does, just without a passing replay behind it.

   **Idempotency guard, check first.** If `fixAddedToDataset` is already set (an earlier pass turned the trace green, added it to the dataset, and a later iteration regressed it), the trace is already in the dataset: do **not** re-label or re-attach. Just tell the user it is already saved in dataset `<name>` (`<datasetId>`) and is currently red again, then stop.

   Otherwise add it now:

   1. **Label the original trace as a validated fail** using the failure annotation from Phase Fix `resolve`: call `mcp__plugin_bitfab_Bitfab__set_human_labels` once with `[{ traceId, label: false, annotation }]` on the **original** trace.
   2. **Pick or create a dataset:** if the user named a dataset ID, use it (first confirm it's scoped to this function via `mcp__plugin_bitfab_Bitfab__list_datasets`; if it belongs to a different function, `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` would silently skip every trace, so use `AskUserQuestion` and offer a correctly-scoped dataset instead). Otherwise call `mcp__plugin_bitfab_Bitfab__list_datasets` with the function key and ask where to save, **keeping the prompt to at most four options, never one per dataset**: **none exist** → create silently; **exactly one** → offer "Add to `<name>`" (recommended) and "Create a new dataset"; **two or more** → offer, in this order, "Add to `<recommended>`" (the most recently used dataset with traces), "Choose a different dataset" (which then presents a second via `AskUserQuestion` listing existing datasets, most recently used first, so the user can route to a specific one), then "Create a new dataset". Hold the `datasetId`.
   3. **Attach the trace** with `mcp__plugin_bitfab_Bitfab__add_traces_to_dataset` (`datasetId`, `[traceId]`; idempotent). **Confirm the attach landed**: the trace is saved when it was added now or was already present. If the tool reports it skipped the trace (for example, the dataset is scoped to a different function or the trace is not in this org), do **not** claim save and do **not** set `fixAddedToDataset`; re-pick a dataset scoped to this function and attach again before stopping.

   Set `fixAddedToDataset = true` only once the attach above is confirmed. Tell the user in one line: the still-failing scenario is saved in dataset `<name>` (`<datasetId>`) to revisit, and the bug is **not** fixed yet (the saved red turns green only once a future fix passes on replay). Then stop.

   **Next:**

   - Mode `fix`: invoke the `assistant-wrap-up` skill with mode `fix`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
19. **Run only when mode is `fix`.**

   **Run only when the user chose "Show in Studio" from a post-target-replay fix prompt.** Open Studio to the single-trace replay's experiment view so the user can inspect the original failing trace, the replay trace, the verdict, and the code-change before/after.

   Use the experiment group from the targeted replay whenever possible. Append `&autoOpenFirst=1` so the page lands straight on this one trace's before/after drawer instead of a one-row list the user has to click into:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio/experiments?experimentGroupId=<fixSingleTraceExperimentGroupId>&autoOpenFirst=1"
   ```

   If `supportsExperimentGroups` was false but you captured `testRunId`, use the fallback instead (same `&autoOpenFirst=1`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" "/studio/experiments?testRunIds=<testRunId>&autoOpenFirst=1"
   ```

   If neither an experiment group nor a test run ID is available, say Studio cannot show this before/after run yet and continue. (`autoOpenFirst=1` opens the first trace's comparison once it loads, then respects the user dismissing it; it is meant for this single-trace view, so don't add it to full-dataset experiment opens.)

   Studio-opening commands block until the user acts in Studio in some hosts. Launch this command as a background/long-running process, read its JSONL stdout incrementally, and do not block the conversation foreground waiting for the user. After opening, tell the user the before/after is open and return to `fix-target-replay-status` so the next prompt still reflects whether the target passed or failed.
20. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate` or `fix`.**

   **Share results to the user.**

   > "After N experiments these are the results: X/Y traces now pass (Z unreplayable, excluded from pass/fail).
   >
   > - ✅ Trace `abc123`: Now passes, [how the annotation's issue was resolved]
   > - ❌ Trace `def456`: Still failing, annotation said [X], output still [Y]
   > - ❌⚠️ Trace `ghi789`: Was passing, now failing (regression)
   > - ⚠️ Trace `jkl012`: Unreplayable, [DB record not found / FK violation / write rejected]"

   Keep `unreplayable` out of the pass-rate denominator. If `unreplayable > 0`, name the cause (missing record, write blocked, env mismatch) and note that fixing the env or trimming those trace IDs will clean up the next iteration. If `check-replay-health` fired in the previous iteration too, flag that infra has now blocked two runs and recommend fixing it before another experiment.

   **When `costRun` is set, lead with the token delta.** The user's goal is cost, so report it next to the pass rate, not as a footnote:

   > "Token cost across the dataset: input <baseIn> → <newIn> (±X%), output <baseOut> → <newOut> (±Y%). Pass rate held at A/B (no quality regressions)."

   Append the token direction to each per-trace line too (e.g. `✅ Trace abc123: now passes, 1,240 → 880 tokens (−29%)`). A correct-but-more-expensive result is a cost regression: call it out even when pass/fail is green. Frame the recommended next step in cost terms (where the remaining token spend is concentrated), not just pass rate.

   These figures use the run's basis (`costBasis`), already chosen upstream in `evaluate-results`. When the basis is `uncached`, the input numbers are the uncached input (`input - cached`) and the headline names it, e.g. "Uncached token cost across the dataset: input <baseIn> → <newIn> (±X%)...", so the chat matches the page's uncached trend; on `all` they are raw `input + output`. Pick one basis and hold it across the headline and every per-trace line.

   Show this across the full data set, and highlight the best outcome concisely. Explain why it worked best with references to code, docs, and/or research if needed. For the best outcome:

   - **If pass rate improved and no regressions**: use `AskUserQuestion` to confirm whether they want to keep iterating or stop
   - **If pass rate improved but regressions exist or no improvement**: tell the user and propose to create a plan for new experiments and continue iterating.

   **If running in text-only mode** (trace IDs were unavailable): append a note that cross-iteration comparison isn't available without trace IDs. Each iteration's results are visible only in-agent for the current run. Upgrading to `@bitfab/sdk` 0.13.5+ and updating the server unlocks persistent experiment tracking across iterations, side-by-side comparison in Studio, and the full experiments page.

   **In `fix` mode with `fixReplayScope = "dataset"`, this is the optional full-dataset experiment after the target trace already replayed.** Frame the result around whether the added trace stayed green and what the full dataset revealed: regressions, still-failing sibling traces, and unreplayable items. When the user chose a terminal-only re-run (`fixDatasetStudio` false), no Studio is open, so this in-chat report **is** the result surface: give the full per-trace breakdown here rather than pointing them at a Studio page. If the added trace now passes and other dataset traces are still red, do NOT auto-loop through them: frame "Keep iterating" as an explicit offer, name how many traces are still failing and ask whether to keep going or stop here.

   **Count real regressions and lead with them.** A regression is a trace that `evaluate-results` scored as a **real PASS** before this fix and a **real FAIL** now (`was-real-PASS → now-real-FAIL`). Do **not** count a trace that merely went unreplayable or shape-incompatible (the infra / shape-mismatch buckets from `replay-against-dataset`'s classify step): that is replay noise, not a regression the fix caused. When real regressions exist, they lead the report ("Your target trace passes, but the change regressed N previously-passing traces"), not a per-trace footnote, and the recommended next step becomes **"Revert the fix and start a new fix"** (`fix-revert-and-restart`): the fix is locally correct but net-negative, so back it out to its pre-fix baseline and begin a fresh targeted attempt rather than stacking another edit on the regressing code. The target trace stays saved in the dataset as a red test to revisit through the revert. This revert path is for when the target stayed **green** but siblings regressed. If instead the **target itself** regressed on the dataset run (it passed the single-trace replay but fails here), that is not a sibling regression and there is no net-positive fix to back out: recommend **"Keep iterating"** for another fix attempt on the target, not the revert option. When there are **no** real regressions, do not offer or recommend the revert option: recommend "Keep iterating" (if sibling traces are still red) or "Stop and wrap up" as before. "Keep iterating" here means refining the current edit in place (another fix attempt on the target); "Revert the fix and start a new fix" first backs the edit out. Before continuing from a full-dataset fix result via "Keep iterating", always reset the fix loop state: set `fixReplayScope = "single-trace"` and `fixSkipMakeChange = false` so the next pass makes a fresh targeted change instead of replaying the dataset again with the previous code (the revert option resets this state itself). The dataset keeps this scenario saved regardless of what they pick.

   Ensure your question includes your recommended next step.

   > A) **Revert the fix and start a new fix**: **Only include this option in `fix` mode when the full-dataset re-run produced real regressions** (`was-real-PASS → now-real-FAIL`, excluding unreplayable/shape-drift items); omit it entirely otherwise. When included, recommend it over Keep iterating: continue to `fix-revert-and-restart`, which backs the fix out to its pre-fix baseline (the target stays saved red in the dataset) and re-enters the single-trace fix loop for a fresh attempt → step 21
   > B) **Keep iterating**: run another experiment from the plan; in `fix` mode after a dataset run, first set `fixReplayScope = "single-trace"` and `fixSkipMakeChange = false`. This is the default recommended next step **except** in `fix` mode when real regressions exist, where "Revert the fix and start a new fix" is recommended instead (see the body) → step 3
   > C) **Stop and wrap up**: move to the final summary → the `assistant-wrap-up` skill

   **Next:**

   - Option C (Stop and wrap up) (mode `wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`): invoke the `assistant-wrap-up` skill with the current mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
21. **Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate` or `fix`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Reverting the fix"`.

   **Run only in `fix` mode when the user chose "Revert the fix and start a new fix" from `share-results` after a regressing dataset re-run.** The fix turned the target green but regressed sibling traces, so back it out cleanly and begin a fresh targeted attempt instead of stacking another edit on the regressing code.

   1. **Restore every file the fix touched to its pre-fix content.** Prefer `fixBaselineSnapshots`, which `make-change` populated per file on first touch across every iteration of this fix session (so it covers files touched by later attempts, not just the first): restore **every** path in the map. For a path in `fixCreatedPaths` (a file the fix **newly created**, which did not exist before the fix), **delete the file** (e.g. `rm -- <path>`) rather than writing its `""` baseline back: an empty write would leave a stray empty file, and `git restore` does not remove an untracked addition. For every other path, write its captured baseline content back with the Edit/Write tools, **including a baseline of `""`** (a file that existed but was empty before the fix): restore it to empty, do not delete it. `fixCreatedPaths` is the only signal for deletion; never infer "created" from a `""` baseline alone. If a baseline snapshot is missing for a path, fall back to `git restore -- <paths>` scoped to **only** the fix-touched paths, but first run `git status` and confirm those files had no unrelated uncommitted changes and the fix was never committed; if either is untrue, restore the pre-fix content by hand rather than discarding unrelated work. **Never run a blanket `git reset` / `git checkout .`.**
   2. **Confirm the revert.** Re-read each restored file and verify it matches the pre-fix baseline. The target trace is now back to its saved **red** state in dataset `<name>` (`<datasetId>`): the change that made it green is gone, which is the correct "saved failing test to revisit" state (same as `fix-save-unfixed`). `fixAddedToDataset` stays true; do not re-attach or re-label.
   3. **Reset the fix loop for a clean attempt.** Clear the per-experiment before/after snapshots and the previous change description, then set `fixReplayScope = "single-trace"` and `fixSkipMakeChange = false` so the next `make-change` writes a fresh targeted fix rather than reusing the reverted edit. **Leave `fixBaselineSnapshots` and `fixCreatedPaths` in place**: the original code is unchanged after a revert, so they stay the revert anchor for the next attempt too.

   Tell the user in one line: the regressing fix is reverted, the target is saved red in the dataset, and you're starting a fresh fix. Then continue to `open-experiments-before-replay` (step 3 set `fixReplayScope = "single-trace"`, so the next pass makes a fresh targeted change and replays only the target trace).
