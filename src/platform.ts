import type { PlatformConfig } from "bitfab-plugin-lib"

export const platform: PlatformConfig = {
  authPath: "claude",
  loginHint: "/bitfab:login",
  setupHint: "/bitfab:setup",
  updateHint: "/bitfab:update",
  repo: "Project-White-Rabbit/bitfab-claude-plugin",
  cliBinary: "claude",
  displayName: "Claude Code",
  supportsAutoUpdate: true,
  marketplaceName: "bitfab",
  pluginName: "bitfab",
  marketplacePreRegistered: false,
}
