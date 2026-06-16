---
name: setup-login
description: Login phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__get_bitfab_api_key", "Skill"]
---

# Bitfab Setup: Login

**Mode:** you were dispatched with a mode (`wizard` or `login`); the gates and Next routing below depend on it.

**Run only when mode is `wizard` or `login`.**

Authenticate with Bitfab and retrieve the API key.

1. Run the status check:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js"
   ```

   If **already authenticated**, skip to step 3.
2. If **"not authenticated"**, run the login script yourself, do NOT ask the user to run it manually:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/login.js"
   ```

   This opens Studio for sign-in and polls until authentication completes. Run with 600000ms timeout (10 minutes). If the command **exits with an error** or **times out**, report the error to the user and stop.

   **Next:**

   - Login fails, errors, or times out (mode `wizard` or `login`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `login`).
3. Call `mcp__plugin_bitfab_Bitfab__get_bitfab_api_key` to retrieve the API key, **NEVER print or log the full key**. Stored at `~/.config/bitfab/credentials.json`, used for the `BITFAB_API_KEY` environment variable.
4. Check whether session log consent has already been recorded:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/sessionLogConsent.js" get
   ```

   If the output is already `true` or `false`, skip the prompt and continue. If the output is `null`, use `AskUserQuestion`:
   - **Question:** "Allow Bitfab to collect session logs?"
   - **Description:** Used to diagnose issues and improve the product.
   - **Options:** "Allow" / "Don't allow"

   Save the answer (replace `CONSENT` with `true` or `false`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/sessionLogConsent.js" set CONSENT
   ```

   **Next:**

   - Mode `wizard`: invoke the `setup-instrument` skill with mode `wizard`.
   - Mode `login`: invoke the `setup-cleanup` skill with mode `login`.
