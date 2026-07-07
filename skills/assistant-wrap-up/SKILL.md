---
name: assistant-wrap-up
description: Phase 6: Validate & Wrap Up phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "Skill"]
---

# Bitfab Assistant: Phase 6: Validate & Wrap Up

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate` or `fix`.**

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" completed "Done"`.

   **Summary.** Use `AskUserQuestion` to present the final results similar to this. You may expand where appropriate based on context from the user:

   > "**Improvement summary for** `<traceFunctionKey>`:
   >
   > - Failed traces fixed: X/Y (from N% → M% pass rate on labeled failures)
   > - Full replay pass rate: A/B (Z unreplayable, excluded)
   > - Changes made:
   >   - [File]: [Description of change]
   >   - [File]: [Description of change]
   >
   > The changes are in your working tree (not committed). Review the diffs and commit when ready."

   If `Z > 0`, add one line naming the infra cause (e.g. "Z traces unreplayable, missing DB rows; refresh the dataset or scope to a snapshot next pass") so the user has a next step beyond the code.

   **Next:**

   - Mode `wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`: invoke the `assistant-cleanup` skill with the current mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `fix`).
