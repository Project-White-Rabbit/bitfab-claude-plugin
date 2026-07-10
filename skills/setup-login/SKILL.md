---
name: setup-login
description: Login phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__get_bitfab_api_key", "Skill"]
---

# Bitfab Setup: Login

**Mode:** you were dispatched with a mode (`wizard` or `login` or `instrument`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `login` or `instrument`.**

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
   Run with 600000ms (10 minute) timeout. This opens Studio to the sign-in page and polls the server until the user completes authentication in the browser. The process exits when authentication succeeds or the 10-minute timeout fires.

   **If the browser fails to open**, `login.js` prints the Studio sign-in URL. Surface it to the user verbatim so they can open it manually; do not rely on shell/tool output being visible. The polling loop stays active for the full 10-minute timeout regardless of whether auto-launch worked.


   If `login.js` exits non-zero or the 10-minute timeout elapsed, report the error to the user and stop.

   **Next:**

   - Login fails, errors, or times out (mode `wizard` or `login` or `instrument`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `login` or `instrument`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
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

   - Mode `wizard` or `instrument`: invoke the `setup-instrument` skill with the current mode (`wizard` or `instrument`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `login`: invoke the `setup-cleanup` skill with mode `login`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
