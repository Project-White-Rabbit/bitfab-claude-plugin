import { execFile } from "node:child_process"

export function getMcpName(serviceUrl: string): string {
  return serviceUrl === "https://simforge.goharvest.ai"
    ? "Simforge"
    : "Simforge-Development"
}

export function installMcpServer(
  serviceUrl: string,
  apiKey: string,
): Promise<void> {
  const mcpName = getMcpName(serviceUrl)
  const mcpUrl = `${serviceUrl}/mcp`

  return new Promise((resolve, reject) => {
    execFile(
      "claude",
      [
        "mcp",
        "add",
        "--scope",
        "user",
        "--transport",
        "http",
        mcpName,
        mcpUrl,
        "--header",
        `Authorization:Bearer ${apiKey}`,
      ],
      { timeout: 15_000 },
      (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      },
    )
  })
}
