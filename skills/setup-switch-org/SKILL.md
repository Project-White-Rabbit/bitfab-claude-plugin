---
name: setup-switch-org
description: Switch Org phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_organizations", "Skill"]
---

# Bitfab Setup: Switch Org

**Run only when mode is `switch-org`.**

Switch which Bitfab organization the plugin reads and writes. Triggered explicitly by `/bitfab:setup switch-org` (or natural-language asks like "switch org" / "change org" / "switch to the <name> org" / "I'm in the wrong org"). The plugin's org is set by the API key in `~/.config/bitfab/credentials.json`; this lists the user's orgs, switches to the chosen one, and replaces that local key. Requires authentication. Does **not** open Studio.

**The live browser does not follow on its own.** Switching persists the new active org server-side (so future sign-ins default to it) and replaces the plugin's key, but a browser tab that's already signed in keeps showing the old org until its session is re-minted. The org actually flips in the browser on the **next** Studio open (a fresh session whose org gate runs Clerk's client-side `setActive`) or when the user picks the org from the in-app org switcher.

**The plugin key and the app's runtime key are separate.** Switching replaces only the plugin's credential in `~/.config/bitfab/credentials.json`. The `BITFAB_API_KEY` your application reads at runtime (from a `.env`-style file) is untouched, so traces your code sends keep landing in the **old** org until that key is updated too. The last step offers to do that.

1. Switching orgs requires an authenticated plugin. Run the status check:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js"
   ```

   If **already authenticated**, continue to step 2. If **not authenticated**, tell the user to sign in first with `/bitfab:setup login`, then stop; do NOT run the login flow as part of switching.

   **Next:**

   - Not authenticated (mode `switch-org`): invoke the `setup-cleanup` skill with mode `switch-org`.
2. Call `mcp__plugin_bitfab_Bitfab__list_organizations` to list the organizations the signed-in user belongs to. Each entry has a name, the user's role, an `id:` (the `clerkOrganizationId`), and the org the plugin uses now is marked `[current]`.

   Choose the target org:
   - **If the user already named an org** (in their request), match it case-insensitively by name against the list and use that org's `id`. If the name matches none, or matches more than one, fall through to asking.
   - **If the only org is the current one**, there's nothing to switch to, so tell the user and stop (route to cleanup).
   - **Otherwise** use `AskUserQuestion` which org to switch to. List each org by name and role, and mark the current one. Use the chosen org's `id`.

   Only ever use an `id` value returned by `mcp__plugin_bitfab_Bitfab__list_organizations`; never invent one. Carry the chosen id into the next step.

   **Next:**

   - The only org is the one already current (nothing to switch to) (mode `switch-org`): invoke the `setup-cleanup` skill with mode `switch-org`.
3. Switch to the chosen org by passing its `clerkOrganizationId`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/switchOrg.js" <clerkOrganizationId>
   ```

   The command prints one JSON line; act on it:
   - `{"event":"switched","status":"switched"|"already-aligned","clerkOrganizationId":"...","organizationName":"...","apiKey":"..."}`: success. The plugin now reads and writes that org and its API key has been replaced locally. Tell the user in one line: the plugin is now connected to **<organizationName>**. Then add that their **already-open browser tabs won't switch on their own**; to see the new org in Studio they re-open it from a plugin action (an experiments or dataset flow) or use the in-app org switcher. Hold on to the `apiKey` value from this JSON; the next step uses it to sync the app's local key, and you must never echo that value to the user.
   - `{"event":"not-member","clerkOrganizationId":"..."}`: the user isn't a member of that org. Report it; do not retry.
   - `{"event":"error","reason":"..."}`: report the reason.

   Do not print or ask for the API key, and do not surface the `apiKey` value to the user; the command replaces the plugin's copy for you and hands you that value solely for the next step.

   - **the command printed `{"event":"switched"}` (or `"already-aligned"`)**: sync the app's local API key next → step 4
   - **the command printed `{"event":"not-member"}` or `{"event":"error"}`**: the plugin key was not replaced, so there is nothing local to sync → the `setup-cleanup` skill

   **Next:**

   - The command printed `{"event":"not-member"}` or `{"event":"error"}` (mode `switch-org`): invoke the `setup-cleanup` skill with mode `switch-org`.
4. This step is reached only when the switch reported `{"event":"switched"}` (or `"already-aligned"`); a `not-member` or `error` result already routed to cleanup with nothing to sync.

   The switch replaced the **plugin's** key (in `~/.config/bitfab/credentials.json`). It did **not** touch the `BITFAB_API_KEY` your own application reads at runtime, so traces your code sends still land in the **old** org until that key is updated too.

   Check whether this project sets `BITFAB_API_KEY` locally: grep for `BITFAB_API_KEY` across `.env`-style files (`.env`, `.env.local`, `.env.development`, and similar) the app loads. Collect **every** file that assigns it, not just the first.
   - **If none is found**, there's nothing local to update, say so in one line and stop (route to cleanup).
   - **If found**, use `AskUserQuestion` whether to update it to the new org's key, naming **all** the files (absolute paths) that hold it. If the user declines, leave them and stop.

   If the user agrees, use the `apiKey` value from the switch step's JSON output as the new key (use it directly, do **not** call any `get_*_api_key` tool here: that resolves a `BITFAB_API_KEY` process-env override ahead of the just-switched credential and can hand back the stale pre-switch key). Rewrite that value in place in **every** file you found, replacing the old value, so no loaded env file keeps a stale key. Do **not** print the key value. Then name each file (absolute path) you updated and note that an already-running dev server, REPL, or test runner may need a restart to pick up the new env value, since most file watchers reload code on save but not env files.

   **Next:**

   - Mode `switch-org`: invoke the `setup-cleanup` skill with mode `switch-org`.
