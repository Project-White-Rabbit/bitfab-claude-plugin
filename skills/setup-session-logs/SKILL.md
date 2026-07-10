---
name: setup-session-logs
description: Session Logs phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "Skill"]
---

# Bitfab Setup: Session Logs

**Run only when mode is `session-logs`.**

Opt in or out of session log collection. Does not require authentication.

1. Check whether session log consent has already been recorded:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/sessionLogConsent.js" get
   ```

   If the output is `true`, tell the user session logs are currently **enabled**. If `false`, tell the user session logs are currently **disabled**. If `null`, tell the user no preference is recorded yet. Then use `AskUserQuestion`:
   - **Question:** "Allow Bitfab to collect session logs?"
   - **Description:** Session logs help us diagnose issues and improve the product. They include prompts, responses, and tool calls from sessions where Bitfab tools are used.
   - **Options:** "Allow" / "Don't allow"

   Save the answer (replace `CONSENT` with `true` or `false`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/sessionLogConsent.js" set CONSENT
   ```

   Confirm the change to the user.

   **Next:**

   - Mode `session-logs`: invoke the `setup-cleanup` skill with mode `session-logs`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
