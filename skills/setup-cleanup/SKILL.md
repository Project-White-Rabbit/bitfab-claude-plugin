---
name: setup-cleanup
description: Cleanup phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash"]
---

# Bitfab Setup: Cleanup

**Mode:** you were dispatched with a mode (`wizard` or `explain` or `login` or `session-logs` or `instrument` or `modify` or `inspect` or `switch-org` or `view` or `replay` or `db-snapshot` or `templates`); the gates and Next routing below depend on it.

1. Close Studio. Run this unconditionally: it resolves the active session from disk, closes the Studio tab, stops the background `openStudioTo.js` event process, and exits quietly (`{"event":"no-active-studio"}`) when nothing was opened:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/closeStudio.js"
   ```

   No sessionId argument is needed; do not track or look up one. This is silent housekeeping: never narrate it, reason about whether a session was opened, or report the outcome to the user (no "closing Studio", no "nothing to close").
