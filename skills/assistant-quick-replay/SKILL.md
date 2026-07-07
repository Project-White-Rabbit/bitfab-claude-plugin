---
name: assistant-quick-replay
description: Phase Replay: Single-Trace Quick Replay phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__read_traces", "Skill"]
---

# Bitfab Assistant: Phase Replay: Single-Trace Quick Replay

**Run only when mode is `replay`.**

Reached only from `replay` mode. The user already has a trace ID and (usually) already made a fix; they just want to replay that one trace and hear whether it worked. This is the **minimal, atomic** path: no Studio/browser, no dataset, no labeling, no experiment groups, no server-side verdict persistence. Locate the replay script, read the trace, run replay against the single trace ID, compare the new output to the original, and report a one-line verdict in chat. The only server interaction is the replay itself (the SDK creates a test run intrinsically); nothing else is persisted.

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Setting up replay"`.

   **Both sub-steps run without user interaction. No questions, just execute.**

   **1. Read the trace (and resolve the function key).** Call `mcp__plugin_bitfab_Bitfab__read_traces` with the trace ID argument and `scope: "full"`. Hold the trace's label, annotation, inputs, and output in context, these are the acceptance criteria for the verdict. **If the user gave only a trace ID and no function key** (common with free-form requests like "did my fix work on `<id>`"), take the trace function key from the trace itself, don't ask the user for it.

   **2. Find the replay script.** Search for files matching `scripts/replay.*`, `scripts/*replay*`, or any file importing `bitfab.replay` / `client.replay`, and confirm it covers that trace function key. (You don't need to grep for capability flags here, this minimal path doesn't use code-change payloads, experiment groups, or verdict persistence.)

   - **replay script found and trace readable**: continue to run the replay → step 2
   - **no replay script found for this function**: tell the user: "No replay script found for `<key>`. Run `/bitfab:setup replay <key>` to create one, then re-run this command." Stop the flow → the `assistant-cleanup` skill
   - **trace not found or unreadable**: tell the user the trace ID wasn't found or is inaccessible, stop → the `assistant-cleanup` skill

   **Next:**

   - No replay script found for this function (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`.
   - Trace not found or unreadable (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`.
2. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Running replay"`.

   **Run the replay against the one trace ID. No user interaction, no extra flags.**

   ```bash
   cd <project-dir> && npx tsx <replay-script> <function-key> --trace-ids <trace-id>
   ```

   This is a single-trace, in-chat path: run the replay directly, no progress-bar wrapper (one item has nothing to track). Do **not** pass `--code-change` or `--experiment-group-id`, this minimal path skips code-change payloads and experiment groups. Capture the JSON output and exit code.

   **Quick health check.** If the replay crashed (non-zero exit, no items) or the single item has `item.error` set, hold the error for the verdict step. Otherwise hold the completed item's new output alongside the original output you read in `setup`.
3. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Evaluating result"`.

   **Compare the single replay result to the original and report in one line.** Nothing is persisted; this is an in-chat verdict.

   **If the replay errored** (crashed or `item.error` set): report the error clearly. This is an infra issue (missing DB row, env mismatch, etc.), not a code failure. Offer to retry after fixing the env, or to stop.

   **If the replay completed**, compare the new output against the original trace's label and annotation, then report one line:

   - Original was **fail** with an annotation: does the new output address it? → "**Pass**: the fix addresses the original failure ('<annotation summary>')." vs "**Still failing**: <what's still wrong>."
   - Original was **pass**: preserved → "**Pass**: output unchanged in quality." regressed → "**Regressed**: was passing, now <what broke>."
   - No label on the original: show a short before/after diff and summarize whether it looks better.

   > A) **Iterate**: make another change and re-replay the same trace → step 4
   > B) **Done** *(recommended)* → the `assistant-cleanup` skill

   **Next:**

   - Option B (Done) (mode `replay`): invoke the `assistant-cleanup` skill with mode `replay`.
4. **Make another change before re-replaying.** Use `AskUserQuestion` to ask what to change, or let the user describe the fix. Edit the code, then loop back to run the replay again. If the user says they'll make the change themselves, wait for their message, then proceed.
