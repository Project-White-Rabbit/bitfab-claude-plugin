---
description: Install or reinstall the Simforge MCP server in Claude Code
allowed-tools: ["Bash"]
---

# Add Simforge MCP

Register the Simforge MCP server with Claude Code. Requires authentication — run `/simforge:login` first if not yet authenticated.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/addMcp.js"
```

After the script completes, confirm the result to the user. If it says already installed, let them know. If it installed successfully, tell them to restart Claude Code to activate the MCP tools. If it failed, show the error.
