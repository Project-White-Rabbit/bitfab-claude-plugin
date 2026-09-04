---
name: assistant-quick-replay
description: Phase Replay: Single-Trace Quick Replay phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__get_traces", "mcp__plugin_bitfab_Bitfab__get_trace_assertions", "Skill"]
---

# Bitfab Assistant: Phase Replay: Single-Trace Quick Replay

**Run only when mode is `replay`.**

Reached only from `replay` mode. The user already has a trace ID and (usually) already made a fix; they just want to replay that one trace and hear whether it worked. This is the **minimal, atomic** path: no Studio/browser, no dataset, no experiment groups. Locate the replay script, read the trace, run replay against the single trace ID, compare the new output to the original, and report a one-line verdict in chat. **Whenever you derive a pass/fail verdict, persist it onto the replay trace** (the same local label you show in chat, saved via node "${CLAUDE_PLUGIN_ROOT}/dist/commands/persistReplayLabels.js") so it isn't silently thrown away. The one exception is an SDK too old to expose replay trace IDs: persistence is then impossible, so the verdict stays in-chat only with an upgrade nudge. The replay itself creates a test run intrinsically (the SDK does this); persistence just adds the agent verdict on top.

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Setting up replay"`.

   **Both sub-steps run without user interaction. No questions, just execute.**

   **1. Read the trace (and resolve the function key).** Call `mcp__plugin_bitfab_Bitfab__get_traces` with the trace ID argument and `scope: "full"`. Hold the trace's label, annotation, inputs, and output in context, these are the acceptance criteria for the verdict. **If the user gave only a trace ID and no function key** (common with free-form requests like "did my fix work on `<id>`"), take the trace function key from the trace itself, don't ask the user for it. **Decide whether this is a re-seed rather than a replay:** the user said re-seed, or asked for the trace to be run again for real, or the trace errored (`hasError` / an error on its root span) and the user wants a good recording of it. A re-seed is not a replay: it runs the function once on the trace's recorded inputs and records the result under the same trace id, with nothing mocked and no experiment. It takes the `reseed` step instead of `run`.

   **2. Find the replay script.** Search for files matching `scripts/replay.*`, `scripts/*replay*`, or any file importing `bitfab.replay` / `client.replay`, and confirm it covers that trace function key. (You don't need to grep for capability flags here, this minimal path doesn't use code-change payloads or experiment groups. It does persist the verdict in the `verdict` step, straight from the replay output's server trace id, with no extra script capability required.)

   **Mandatory pre-run replay safety check.** Complete this before executing the replay script for the first time, and re-run it whenever the script, replay root, span boundaries, dispatch model, or mock strategy changes. Do not discover unsafe coverage by running replay: a successful email, payment, queue publish, or database write has already caused the damage.

   1. Read the replay call and require an explicit recorded-output strategy: normally `mock: "marked"` / `mock="marked"`; `all` is allowed only when every matched recorded child is intentionally frozen. Never accept `none` for a path with unsafe external actions.
   2. Trace every unsafe action reachable from the replay root (database writes, outbound mutations, queue publishes, emails, payments, file/vector writes). Under `marked`, each must execute inside a manual descendant span marked `mockOnReplay: true` / `mock_on_replay: true`. Auto-observed spans, unwrapped calls, root-inline work, and import-time work are not intercepted. Move the boundary before proceeding; if that cannot be done without changing behavior, report the exact blocker and stop.
   3. Verify the selected wrapper executes as a descendant in the same replay context. Python thread pools and `threading.Thread` require `Bitfab(trace_across_threads=True)`; pre-created queue consumers and other processes are not covered. Ruby span state is thread-local, so work dispatched to another or pre-created thread/process is not mockable from the replay root. Move the unsafe boundary into the replay context or stop. Ordinary same-context TypeScript async work and Python `asyncio` tasks/`asyncio.to_thread` retain context.
   4. In TypeScript, a synchronous selected span cannot consume the lazy recorded-output fetch used by `mock: "marked"`. Use an already-async/Promise-returning boundary, or use `mock: "all"` only when freezing every matched child is compatible with the experiment. Never change a production function's return type just to make replay work; if neither option is valid, stop.

   The SDK fails a selected mock closed when its historical tree or occurrence is unavailable, but that protects only calls that pass this check. Hold `replaySafetyVerified = true` only after every unsafe action passes it.

   - **the user asked for a re-seed, or the trace errored and wants a real run recorded**: re-seed the trace in place instead of replaying it; a re-seed runs unsafe actions on purpose, so the safety check's findings are carried into that step for an explicit go-ahead rather than stopping here → step 5
   - **the replay safety check finds any uncovered or unmockable unsafe action**: report the exact call and why replay interception cannot cover it, then stop without executing replay → the `assistant-cleanup` skill
   - **replay script found and trace readable**: continue to run the replay → step 2
   - **no replay script found for this function**: tell the user: "No replay script found for `<key>`. Run `/bitfab:setup replay <key>` to create one, then re-run this command." Stop the flow → the `assistant-cleanup` skill
   - **trace not found or unreadable**: tell the user the trace ID wasn't found or is inaccessible, stop → the `assistant-cleanup` skill

   **Next:**

   - The replay safety check finds any uncovered or unmockable unsafe action (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - No replay script found for this function (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Trace not found or unreadable (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
2. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Running replay"`.

   **Run the replay against the one trace ID. No user interaction, no extra flags.** Invoke the replay script you located in `setup` with the project's own language runner:

   ```bash
   # TypeScript: cd <project-dir> && npx tsx <replay-script> <function-key> --trace-ids <trace-id>
   # Python:     cd <project-dir> && python <replay-script> <function-key> --trace-ids <trace-id>   (or uv run / poetry run)
   # Ruby:       cd <project-dir> && ruby <replay-script> <function-key> --trace-ids <trace-id>      (or bundle exec)
   ```

   This is a single-trace, in-chat path: run the replay directly, no progress-bar wrapper (one item has nothing to track). Do **not** pass `--code-change` or `--experiment-group-id`, this minimal path skips code-change payloads and experiment groups (persisting the verdict in the next step needs neither). Capture the full replay-result JSON and exit code, and from it hold the run's test-run id (`testRunId` in TS, `test_run_id` in Python/Ruby) and the completed item's trace id (`traceId` in TS, `trace_id` in Python/Ruby). **In the final replay result this trace id is already the SERVER replay trace id** (the SDK's `completeReplay` overwrites the local id with the server row id before returning), so the verdict step persists against it directly, no `get_replay_status` mapping. **If it is `null`, persistence is impossible this run** (an old server/SDK that returns no server-trace-id mapping), note that so the verdict step falls back to an in-chat-only verdict.

   **Quick health check.** If the replay crashed (non-zero exit, no items) or the single item has `item.error` set, hold the error for the verdict step. Otherwise hold the completed item's new output alongside the original output you read in `setup`.
3. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Evaluating result"`.

   **Compare the single replay result to the original, report one line, then persist that verdict onto the replay trace.**

   **If the replay errored**, report the concrete error and its source; do not label every error an environment problem. A non-zero exit with no items is a whole-script or whole-run failure, so diagnose its stderr/exception before offering a retry. For an errored item, inspect `traceError` / `replayError` in TypeScript or `trace_error` / `replay_error` in Python and Ruby, plus the compatible `error` message:

   - A selected-mock tree/occurrence/output miss is an instrumentation or historical-trace mismatch. The real call did not run; fix the span boundary, selection, or source trace before retrying.
   - A structured database branch or lease error is replay infrastructure. Report its code and remedy that setup.
   - Another `replayError` / `replay_error` happened before the root ran (for example input hydration or adaptation); report that exact setup failure.
   - A `traceError` / `trace_error` came from executing the replayed root. Treat it as a possible changed-code failure unless its message identifies the fail-closed selected-mock case above.

   There is no verdict to persist for an errored item. Offer a retry only after the diagnosed cause is addressed, or offer to stop.

   **If the replay completed**, call `mcp__plugin_bitfab_Bitfab__get_trace_assertions` with the ORIGINAL trace id first. An assertion says what the user asked this one case to do, and the replay inherits the original's assertions, so it is what the new output is measured against. Each one comes back as `[ID: <uuid>] checks <target>: <assertion>`, and that `[ID: <uuid>]` value is the `assertionId` its verdict carries. "no expectations recorded" means the trace has none, and everything below reads exactly as it always has.

   Then compare the new output against the original trace's assertions, label, and annotation, and report one line:

   - Original was **fail** with an annotation: does the new output address it? → "**Pass**: the fix addresses the original failure ('<annotation summary>')." vs "**Still failing**: <what's still wrong>."
   - Original was **pass**: preserved → "**Pass**: output unchanged in quality." regressed → "**Regressed**: was passing, now <what broke>."
   - No label on the original: show a short before/after diff and summarize whether it looks better.

   **Then persist that verdict onto the replay trace.** The pass/fail you just reported is a local label, save it so it survives the session and lands on the replay trace, exactly like the full replay path. This is not optional when persistence is possible: displaying a verdict and dropping it is the bug this step exists to prevent.

   - **If the completed item's trace id is non-null** (its value is already the SERVER replay trace id, per the `run` step): persist against it directly, no `get_replay_status` call. Write a one-entry verdicts file to an absolute path under `<repoRoot>/.bitfab/tmp/` (`<repoRoot>` = `git rev-parse --show-toplevel`; create the dir if missing) and run the persist script. **The verdicts file keys are the command's fixed camelCase contract (`expectedTraceIds`, `traceId`) regardless of the SDK language, its VALUE is the server trace id you held from the replay output (`traceId` in TS, `trace_id` in Python/Ruby):**

     ```json
     {
       "expectedTraceIds": ["<server-trace-id>"],
       "verdicts": [
         { "traceId": "<server-trace-id>", "label": true, "annotation": "<the same one-line reason you reported above>", "confidence": "High" }
       ]
     }
     ```

     **If the original had assertions**, that one entry becomes one entry per assertion instead, each carrying its `assertionId`, its own `label`, and its own `annotation` for that assertion alone, and the file carries **no** whole-trace entry for the trace. The trace verdict is derived from the per-assertion rows, so sending both makes the script reject the file with `status: "invalid-input"`. An assertion whose target cannot be found on the replay trace gets `{ "traceId": "<server-trace-id>", "assertionId": "<uuid>", "skip": true }`, never a FAIL, and its siblings are still verdicted:

     ```json
     {
       "expectedTraceIds": ["<server-trace-id>"],
       "verdicts": [
         { "traceId": "<server-trace-id>", "assertionId": "<assertionId1>", "label": true, "annotation": "<why this one assertion passed>", "confidence": "High" },
         { "traceId": "<server-trace-id>", "assertionId": "<assertionId2>", "label": false, "annotation": "<why this one assertion failed>" }
       ]
     }
     ```

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/dist/commands/persistReplayLabels.js" <repoRoot>/.bitfab/tmp/verdicts-<test-run-id>.json
     ```

     `label` is `true` for Pass, `false` for Still-failing / Regressed. Read the script's single JSON status line: `ok` means the verdict is now on the replay trace, add "· saved" to your one-line report.
   - **If the completed item's trace id is `null`** (old server/SDK that returns no server-trace-id mapping, from the `run` step's note): persistence is impossible. Keep the verdict in-chat only and tell the user once: "This replay didn't return a server trace ID, so the verdict can't be saved. Upgrade the SDK/server and run `/bitfab:setup replay` to regenerate the script." Don't block the flow on it.
   - **No-label original with no assertions either** (you showed a before/after diff, no pass/fail): there's no verdict to persist, just report the diff. An unlabeled original that HAS assertions is not this case, the assertions are the criteria, so score them one per assertion and persist them.

   > A) **Iterate**: make another change and re-replay the same trace → step 4
   > B) **Done** *(recommended)* → the `assistant-cleanup` skill

   **Next:**

   - Option B (Done) (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
4. **Make another change before re-replaying.** Use `AskUserQuestion` to ask what to change, or let the user describe the fix. Edit the code, then loop back to run the replay again. If the user says they'll make the change themselves, wait for their message, then proceed.
5. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Re-seeding"`.

   **Run the trace again for real and record the result under the same id.** A re-seed is a seed, not a replay: nothing is mocked, no test run or experiment is created, and the trace keeps its id, labels, assertions, dataset membership, name, and metadata. The previous run is kept as its own trace, linked back to this one, so nothing is deleted.

   **It runs the function exactly as production does, side effects included.** If the safety check in `setup` found any unsafe action (an email, a payment, a write to a live system), say exactly which call would run for real and get an explicit go-ahead before continuing; a re-seed has no mocking to hide behind.

   Find the registry the replay script hands to `--registry` (a `bitfab-replay --registry <path>` line in the script, `package.json`, or `pyproject.toml`) and the pipeline name in it that covers the function key. Then run the SDK's seed command through that registry, with no other flags:

   ```bash
   # TypeScript: cd <project-dir> && npx bitfab-seed --registry <registry-path> <pipeline> --from-trace <trace-id>
   # Python:     cd <project-dir> && bitfab-seed --registry <registry-path> <pipeline> --from-trace <trace-id>   (or uv run / poetry run)
   ```

   The Ruby SDK has no seed command yet; tell the user so and stop. If the command is missing or rejects `--from-trace`, the SDK predates re-seeding: ask the user to upgrade it, and do not fall back to a replay, which would record an experiment rather than refresh the trace.

   Read the JSON result. `reseeded[0].traceId` is the trace the user gave, now holding the fresh run, and `reseeded[0].previousRunTraceId` is where the old run went. Report one line: "Re-seeded `<trace id, 8 chars>`: it now holds a fresh run of the same inputs; the previous run is kept as `<previous id, 8 chars>`. Its graders re-run on the next pass." If the function threw, the trace is untouched: report the error the run produced and stop, since a re-seed only adopts a run that completed.

   **Next:**

   - Mode `replay`: invoke the `assistant-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
