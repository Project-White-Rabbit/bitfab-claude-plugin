---
name: setup-login
description: Login phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__get_bitfab_api_key", "Skill"]
---

# Bitfab Setup: Login

**Mode:** you were dispatched with a mode (`wizard` or `login` or `instrument`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard`, `login` or `instrument`.**

Authenticate with Bitfab and retrieve the API key.

1. Run the status check:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js"
   ```

   If **already authenticated**, skip to step 3.
2. If not authenticated, run node "${CLAUDE_PLUGIN_ROOT}/dist/commands/login.js" as a long-running background process. Immediately relay its sign-in URL to the user. Poll the process while keeping the conversation available. The command automatically opens a sign-in window and exits after authentication, or after ten minutes. The printed link is available if the window cannot open. On failure, report the error and let the user retry. Never print or request API keys in chat.

   **Next:**

   - Login fails, errors, or times out (mode `wizard` or `login` or `instrument`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `login` or `instrument`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
3. Call `mcp__plugin_bitfab_Bitfab__get_bitfab_api_key` to retrieve the API key, **NEVER print or log the full key**. Stored at `~/.config/bitfab/credentials.json`, used for the `BITFAB_API_KEY` environment variable.

   **If `mcp__plugin_bitfab_Bitfab__get_bitfab_api_key` is not available in this session**, the MCP server is switched off, not broken: it ships inside this plugin, so an absent tool is a setting rather than a failed install. Say so and hand the user the fix below; do not diagnose further, and do not fall back to drafting anything by hand.

   Tell them to run `/mcp`, enable **Bitfab**, then re-run this skill. The tools load into the running session, so nothing is lost. Do **not** suggest restarting: the setting is stored per project and survives a relaunch, so they would come back just as stuck. Ignore `claude mcp list` here, it health-checks the server in its own process and prints `Connected` even when this session cannot reach it.

   Then **stop**, the same way a failed login stops. Do not fall through to the remaining steps: every phase after this one needs these tools, so continuing only moves the failure further from its cause.
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

   - Mode `wizard`: invoke the `setup-explain` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `login`: invoke the `setup-cleanup` skill with mode `login`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `instrument`: invoke the `setup-instrument` skill with mode `instrument`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
