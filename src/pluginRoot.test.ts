import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { PLUGIN_ROOT } from "./pluginRoot.js"
import { getVersion } from "./version.js"

describe("PLUGIN_ROOT", () => {
  it("resolves to the folder holding .claude-plugin/plugin.json", () => {
    expect(
      fs.existsSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json")),
    ).toBe(true)
    expect(path.basename(PLUGIN_ROOT)).toBe("bitfab-claude-plugin")
  })
})

describe("getVersion", () => {
  it("reads the version from the plugin root package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_ROOT, "package.json"), "utf-8"),
    )
    expect(getVersion()).toBe(pkg.version)
  })
})
