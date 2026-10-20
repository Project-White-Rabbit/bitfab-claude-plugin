import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  detectClaudeInstallScopes,
  pluginUpdateScopes
} from "./chunk-H4TJOA2Z.js";

// _target/dist/platform.js
var PLUGIN_KEY = "bitfab@bitfab";
function buildPluginUpdateCommands(scopes) {
  const targets = pluginUpdateScopes(scopes);
  return [
    "claude plugin marketplace update bitfab",
    ...targets.map((scope) => `claude plugin update bitfab@bitfab --scope ${scope}`)
  ];
}
var platform = {
  authPath: "claude",
  loginHint: "/bitfab:setup login",
  setupHint: "/bitfab:setup",
  updateHint: "/bitfab:update",
  repo: "Project-White-Rabbit/bitfab-claude-plugin",
  remotePackageJsonPath: "package.json",
  cliBinary: "claude",
  displayName: "Claude Code",
  supportsAutoUpdate: true,
  enableAutoUpdateHint: "/plugin \u2192 Marketplaces \u2192 bitfab \u2192 Enable auto-update",
  marketplaceName: "bitfab",
  pluginName: "bitfab",
  marketplacePreRegistered: false,
  pluginUpdateCommands: [
    "claude plugin marketplace update bitfab",
    "claude plugin update bitfab@bitfab"
  ],
  detectInstallScopes: () => detectClaudeInstallScopes(PLUGIN_KEY),
  buildPluginUpdateCommands
};

export {
  platform
};
