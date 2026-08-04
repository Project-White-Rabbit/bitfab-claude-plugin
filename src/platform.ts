import {
  detectClaudeInstallScopes,
  type InstallScope,
  type PlatformConfig,
  pluginUpdateScopes,
} from "bitfab-plugin-lib"

const PLUGIN_KEY = "bitfab@bitfab"

function buildPluginUpdateCommands(
  scopes: readonly InstallScope[],
): readonly string[] {
  const targets = pluginUpdateScopes(scopes)
  return [
    "claude plugin marketplace update bitfab",
    ...targets.map(
      (scope) => `claude plugin update bitfab@bitfab --scope ${scope}`,
    ),
  ]
}

export const platform: PlatformConfig = {
  authPath: "claude",
  loginHint: "/bitfab:setup login",
  setupHint: "/bitfab:setup",
  updateHint: "/bitfab:update",
  repo: "Project-White-Rabbit/bitfab-claude-plugin",
  remotePackageJsonPath: "package.json",
  cliBinary: "claude",
  displayName: "Claude Code",
  supportsAutoUpdate: true,
  marketplaceName: "bitfab",
  pluginName: "bitfab",
  marketplacePreRegistered: false,
  pluginUpdateCommands: [
    "claude plugin marketplace update bitfab",
    "claude plugin update bitfab@bitfab",
  ],
  detectInstallScopes: () => detectClaudeInstallScopes(PLUGIN_KEY),
  buildPluginUpdateCommands,
}
