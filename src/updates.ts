import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getVersion } from "./version.js"

const CURRENT_VERSION = getVersion()
const REPO = "Project-White-Rabbit/bitfab-claude-plugin"

async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/${REPO}/main/package.json`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (!response.ok) {
      return null
    }
    const pkg = (await response.json()) as { version: string }
    return pkg.version
  } catch {
    return null
  }
}

function isNewer(latest: string, current: string): boolean {
  const [lMajor, lMinor, lPatch] = latest.split(".").map(Number)
  const [cMajor, cMinor, cPatch] = current.split(".").map(Number)

  if (lMajor !== cMajor) {
    return lMajor > cMajor
  }
  if (lMinor !== cMinor) {
    return lMinor > cMinor
  }
  return lPatch > cPatch
}

interface UpdateStatus {
  current: string
  latest: string | null
  updateAvailable: boolean
  autoUpdateEnabled: boolean
}

function isAutoUpdateEnabled(): boolean {
  try {
    const marketplacesPath = path.join(
      os.homedir(),
      ".claude",
      "plugins",
      "known_marketplaces.json",
    )
    const content = fs.readFileSync(marketplacesPath, "utf-8")
    const data = JSON.parse(content) as Record<
      string,
      { autoUpdate?: boolean; source?: { repo?: string } }
    >
    for (const marketplace of Object.values(data)) {
      if (marketplace.source?.repo === REPO) {
        return marketplace.autoUpdate === true
      }
    }
  } catch {
    // File doesn't exist or can't be parsed
  }
  return false
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  const latest = await getLatestVersion()
  return {
    current: CURRENT_VERSION,
    latest,
    updateAvailable: latest !== null && isNewer(latest, CURRENT_VERSION),
    autoUpdateEnabled: isAutoUpdateEnabled(),
  }
}

export function formatUpdateMessage(latest: string): string {
  return `v${latest} available — run /bitfab:update to update`
}
