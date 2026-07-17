---
name: assistant-quick-replay
description: Phase Replay: Single-Trace Quick Replay phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__read_traces", "Skill"]
---

# Bitfab Assistant: Phase Replay: Single-Trace Quick Replay

**Run only when mode is `replay`.**

Reached only from `replay` mode. The user already has a trace ID and (usually) already made a fix; they just want to replay that one trace and hear whether it worked. This is the **minimal, atomic** path: no Studio/browser, no dataset, no experiment groups. Locate the replay script, read the trace, run replay against the single trace ID, compare the new output to the original, and report a one-line verdict in chat. **Whenever you derive a pass/fail verdict, persist it onto the replay trace** (the same local label you show in chat, saved via node "${CLAUDE_PLUGIN_ROOT}/dist/commands/persistReplayLabels.js") so it isn't silently thrown away. The one exception is an SDK too old to expose replay trace IDs: persistence is then impossible, so the verdict stays in-chat only with an upgrade nudge. The replay itself creates a test run intrinsically (the SDK does this); persistence just adds the agent verdict on top.

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Setting up replay"`.

   **Both sub-steps run without user interaction. No questions, just execute.**

   **1. Read the trace (and resolve the function key).** Call `mcp__plugin_bitfab_Bitfab__read_traces` with the trace ID argument and `scope: "full"`. Hold the trace's label, annotation, inputs, and output in context, these are the acceptance criteria for the verdict. **If the user gave only a trace ID and no function key** (common with free-form requests like "did my fix work on `<id>`"), take the trace function key from the trace itself, don't ask the user for it.

   **2. Find the replay script.** Search for files matching `scripts/replay.*`, `scripts/*replay*`, or any file importing `bitfab.replay` / `client.replay`, and confirm it covers that trace function key. (You don't need to grep for capability flags here, this minimal path doesn't use code-change payloads or experiment groups. It does persist the verdict in the `verdict` step, straight from the replay output's server trace id, with no extra script capability required.)

   - **replay script found and trace readable**: continue to run the replay → step 2
   - **no replay script found for this function**: tell the user: "No replay script found for `<key>`. Run `/bitfab:setup replay <key>` to create one, then re-run this command." Stop the flow → the `assistant-cleanup` skill
   - **trace not found or unreadable**: tell the user the trace ID wasn't found or is inaccessible, stop → the `assistant-cleanup` skill

   **Next:**

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

   **If the replay errored** (crashed or `item.error` set): report the error clearly. This is an infra issue (missing DB row, env mismatch, etc.), not a code failure. There is no verdict to persist. Offer to retry after fixing the env, or to stop.

   **If the replay completed**, compare the new output against the original trace's label and annotation, then report one line:

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

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/dist/commands/persistReplayLabels.js" <repoRoot>/.bitfab/tmp/verdicts-<test-run-id>.json
     ```

     `label` is `true` for Pass, `false` for Still-failing / Regressed. Read the script's single JSON status line: `ok` means the verdict is now on the replay trace, add "· saved" to your one-line report.
   - **If the completed item's trace id is `null`** (old server/SDK that returns no server-trace-id mapping, from the `run` step's note): persistence is impossible. Keep the verdict in-chat only and tell the user once: "This replay didn't return a server trace ID, so the verdict can't be saved. Upgrade the SDK/server and run `/bitfab:setup replay` to regenerate the script." Don't block the flow on it.
   - **No-label original** (you showed a before/after diff, no pass/fail): there's no verdict to persist, just report the diff.

   > A) **Iterate**: make another change and re-replay the same trace → step 4
   > B) **Done** *(recommended)* → the `assistant-cleanup` skill

   **Next:**

   - Option B (Done) (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
4. **Make another change before re-replaying.** Use `AskUserQuestion` to ask what to change, or let the user describe the fix. Edit the code, then loop back to run the replay again. If the user says they'll make the change themselves, wait for their message, then proceed.
