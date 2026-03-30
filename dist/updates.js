import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getVersion } from "./version.js";
const CURRENT_VERSION = getVersion();
const REPO = "Project-White-Rabbit/bitfab-claude-plugin";
async function getLatestVersion() {
    try {
        const response = await fetch(`https://raw.githubusercontent.com/${REPO}/main/package.json`, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) {
            return null;
        }
        const pkg = (await response.json());
        return pkg.version;
    }
    catch {
        return null;
    }
}
function isNewer(latest, current) {
    const [lMajor, lMinor, lPatch] = latest.split(".").map(Number);
    const [cMajor, cMinor, cPatch] = current.split(".").map(Number);
    if (lMajor !== cMajor) {
        return lMajor > cMajor;
    }
    if (lMinor !== cMinor) {
        return lMinor > cMinor;
    }
    return lPatch > cPatch;
}
function isAutoUpdateEnabled() {
    try {
        const marketplacesPath = path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json");
        const content = fs.readFileSync(marketplacesPath, "utf-8");
        const data = JSON.parse(content);
        for (const marketplace of Object.values(data)) {
            if (marketplace.source?.repo === REPO) {
                return marketplace.autoUpdate === true;
            }
        }
    }
    catch {
        // File doesn't exist or can't be parsed
    }
    return false;
}
export async function checkForUpdate() {
    const latest = await getLatestVersion();
    return {
        current: CURRENT_VERSION,
        latest,
        updateAvailable: latest !== null && isNewer(latest, CURRENT_VERSION),
        autoUpdateEnabled: isAutoUpdateEnabled(),
    };
}
export function formatUpdateMessage(latest) {
    return `v${latest} available — run /bitfab:update to update`;
}
