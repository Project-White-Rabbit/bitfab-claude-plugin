import { detectClaudeInstallScopes, } from "bitfab-plugin-lib";
const PLUGIN_KEY = "bitfab@bitfab";
function buildPluginUpdateCommands(scopes) {
    // When detection fails (empty scopes), default to user scope to preserve
    // historical behavior. Otherwise issue one update per detected scope so we
    // also catch project/local installs that ignore the implicit user default.
    const targets = scopes.length > 0 ? scopes : ["user"];
    return [
        "claude plugin marketplace update bitfab",
        ...targets.map((scope) => `claude plugin update bitfab@bitfab --scope ${scope}`),
    ];
}
export const platform = {
    authPath: "claude",
    loginHint: "/bitfab:login",
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
};
