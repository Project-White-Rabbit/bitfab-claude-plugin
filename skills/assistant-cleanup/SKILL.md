---
name: assistant-cleanup
description: Cleanup phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash"]
---

# Bitfab Assistant: Cleanup

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `benchmark` or `replay` or `fix`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark`, `replay` or `fix`.**

1. Close Studio. Run this unconditionally: it resolves the active session from disk, closes the Studio tab (the daemon ends the session and stops appending to the event file), and exits quietly (`{"event":"no-active-studio"}`) when nothing was opened:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/closeStudio.js"
   ```

   No sessionId argument is needed; do not track or look up one. This is silent housekeeping: never narrate it, reason about whether a session was opened, or report the outcome to the user (no "closing Studio", no "nothing to close").
