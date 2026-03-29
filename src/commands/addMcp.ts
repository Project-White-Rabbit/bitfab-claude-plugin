import { getConfig, hasCredentials } from "../config.js"
import { installMcpServer } from "../mcp.js"

async function main() {
  if (!hasCredentials()) {
    console.error("Not authenticated. Run /simforge:login first.")
    process.exit(1)
  }

  const config = getConfig()
  if (!config.apiKey) {
    console.error("No API key found. Run /simforge:login first.")
    process.exit(1)
  }

  await installMcpServer(config.serviceUrl, config.apiKey)
  console.log(`Simforge MCP server installed (${config.serviceUrl}/mcp). Restart Claude Code to activate.`)
}

main().catch((err) => {
  console.error("Failed to install MCP server:", err.message)
  process.exit(1)
})
