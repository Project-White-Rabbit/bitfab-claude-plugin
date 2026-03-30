---
description: Authenticate with Bitfab and configure MCP tools
allowed-tools: ["Bash"]
---

# Bitfab Login

Run the login script to authenticate with Bitfab. This will open your browser to sign in, save your credentials locally, and auto-configure the Bitfab MCP server.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/login.js"
```

After the script completes, confirm the result to the user. If successful, say "You're authenticated with Bitfab and the MCP server has been configured. Restart Claude Code to activate the MCP tools." If authentication succeeded but MCP auto-configuration failed, show the manual command from the output. If login failed, show the error message.
