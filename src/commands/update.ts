import {
  checkForUpdate,
  detectLegacyInstall,
  legacyMigrationMessage,
} from "bitfab-plugin-lib"
import { platform } from "../platform.js"
import { getVersion } from "../version.js"

async function main() {
  if (detectLegacyInstall(platform)) {
    console.log(legacyMigrationMessage(platform))
    return
  }

  const { current, latest, updateAvailable } = await checkForUpdate(
    getVersion(),
    platform,
  )

  if (!updateAvailable || !latest) {
    console.log(`Bitfab plugin v${current} is already up to date.`)
    return
  }

  console.log(`Update available: v${current} → v${latest}`)
  console.log()
  console.log("Run these slash commands in Claude Code to update:")
  console.log()
  console.log(`  /plugin marketplace update ${platform.marketplaceName}`)
  console.log(
    `  /plugin update ${platform.pluginName}@${platform.marketplaceName}`,
  )
  console.log()
  console.log(`Then restart ${platform.displayName} to apply the update.`)
  console.log()
  console.log(
    `Tip: auto-update is enabled by default for ${platform.marketplaceName}, so updates typically apply automatically on the next session start.`,
  )
}

main().catch((err) => {
  console.error("Update failed:", err.message)
  process.exit(1)
})
