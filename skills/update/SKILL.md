---
description: Update Bitfab plugin and SDK to the latest versions. TRIGGER when: user wants to update Bitfab, upgrade the SDK, get the latest version, or says 'update bitfab', 'upgrade SDK', 'latest version'. SKIP when: user wants to instrument code or iterate on traces.
argument-hint: "[plugin|sdk|all]"
allowed-tools: ["Bash", "Skill"]
---

# Bitfab Update

Update the Bitfab Claude Code plugin and/or every workspace's SDK in the current project.

| Invocation | What runs |
|---|---|
| `/bitfab:update` or `/bitfab:update all` | Plugin update **and** SDK update per workspace |
| `/bitfab:update plugin` | Plugin update only, skips all SDK steps |
| `/bitfab:update sdk` | SDK update only, skips the plugin check |

**CLI commands** available via Bash (all paths relative to `${CLAUDE_PLUGIN_ROOT}/dist/commands/`):

| Command | Description |
|---------|-------------|
| `update.js <mode>` | Run the plugin/SDK update script (checks versions, installs latest) |

## Setup

1. Pass the mode argument the user invoked through to the script (omit for the default `all`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/update.js" <mode>
   ```

   - For `/bitfab:update plugin`, run with `plugin`.
   - For `/bitfab:update sdk`, run with `sdk`.
   - For `/bitfab:update` or `/bitfab:update all`, run with no argument (or `all`).

   The script does up to two things depending on mode:
   - **Plugin phase** (`all` or `plugin`), updates the plugin if a newer version is available.
   - **SDK phase** (`all` or `sdk`), queries the registry for the latest SDK version and prints a `<bitfab-sdk-status>` block with one JSON entry per `(workspace, language)` pair. Falls back to the baked snapshot (set `remoteCheckFailed: true`) if the registry lookup fails.

   **Next:**

   - Mode `all` or `plugin`: invoke the `update-plugin` skill with the current mode (`all` or `plugin`).
   - Mode `sdk`: invoke the `update-sdk` skill with mode `sdk`.
