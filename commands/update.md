---
description: Update Bitfab plugin to the latest version
allowed-tools: ["Bash"]
---

# Bitfab Update

Run the version check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/update.js"
```

The script does not apply any updates itself — it only reports the current and latest versions. Relay its output to the user:

- If the script reports the plugin is already up to date, tell the user that and stop.
- If it reports an update is available, tell the user to run the two `/plugin ...` slash commands the script printed (do **not** attempt to run them yourself — built-in `/plugin` commands cannot be invoked from a tool call), then restart Claude Code.
