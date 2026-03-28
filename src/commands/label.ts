import { exec, execSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import { getConfig, hasCredentials } from "../config.js"

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: ["google-chrome", "chromium-browser", "chromium"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
}

function findChrome(): string | null {
  const platform = os.platform()
  const candidates = CHROME_PATHS[platform] ?? []

  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    } else {
      try {
        execSync(`which ${candidate}`, { stdio: "ignore" })
        return candidate
      } catch {
        // not found
      }
    }
  }

  return null
}

function getFrontmostApp(): string | null {
  if (os.platform() !== "darwin") {
    return null
  }
  try {
    return execSync(
      `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
      { stdio: "pipe", encoding: "utf-8" },
    ).trim()
  } catch {
    return null
  }
}

function focusApp(appName: string | null): void {
  if (!appName || os.platform() !== "darwin") {
    return
  }
  exec(`osascript -e 'tell application "${appName}" to activate'`)
}

function openBrowser(url: string): void {
  const chrome = findChrome()

  if (chrome) {
    exec(`"${chrome}" --app="${url}"`)
    return
  }

  const platform = os.platform()
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open"

  exec(`${cmd} "${url}"`)
}

function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === "object") {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        reject(new Error("Could not find open port"))
      }
    })
  })
}

async function main() {
  const traceId = process.argv[2]

  if (!traceId) {
    console.error("Usage: label <traceId>")
    console.error("No trace ID provided.")
    process.exit(1)
  }

  if (!hasCredentials()) {
    console.error("Not authenticated. Run /simforge:login first.")
    process.exit(1)
  }

  const config = getConfig()
  const previousApp = getFrontmostApp()
  const port = await findOpenPort()

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`)

    if (url.pathname === "/done") {
      const status = url.searchParams.get("status") ?? "unknown"
      const decision = url.searchParams.get("decision")
      const isFetch = url.searchParams.get("isFetch") === "true"

      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<html>
<body style="margin:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden">
  <div style="text-align:center;max-width:400px">
    <h1 style="font-size:24px;font-weight:600;margin:0 0 16px 0">Simforge</h1>
    <p style="margin:0;color:#059669">Labeling complete! You can close this window.</p>
    <button onclick="window.close()" style="margin-top:16px;padding:8px 16px;background:#0f172a;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer">Close Window</button>
  </div>
</body>
</html>`)

      if (status === "saved") {
        console.log(`Labeling complete: ${decision ?? "labeled"}`)
      } else {
        console.log("Labeling ended without saving.")
      }

      setTimeout(() => {
        if (isFetch) {
          focusApp(previousApp)
        }
        server.close()
        process.exit(0)
      }, 500)
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, () => {
    const labelUrl = `${config.serviceUrl}/labeling/${encodeURIComponent(traceId)}?callbackPort=${port}`
    console.log(`Opening labeling page: ${labelUrl}`)
    openBrowser(labelUrl)
    console.log("Waiting for labeling to complete...")
  })

  setTimeout(() => {
    console.log("Labeling timed out after 10 minutes.")
    server.close()
    process.exit(0)
  }, 600_000)
}

main().catch((err) => {
  console.error("Failed to open labeling page:", err.message)
  process.exit(1)
})
