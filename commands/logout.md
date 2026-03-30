---
description: Log out of Bitfab and remove MCP server configuration
allowed-tools: ["Bash"]
---

# Bitfab Logout

Run the logout script to remove stored Bitfab credentials and the MCP server configuration.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/logout.js"
```

After the script completes, confirm: "Logged out of Bitfab. MCP tools will be unavailable until you run /bitfab:login again."
