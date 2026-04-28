import { describe, expect, it } from "vitest"
import { platform } from "./platform.js"

describe("platform", () => {
  it("uses Claude-specific auth and hints", () => {
    expect(platform.authPath).toBe("claude")
    expect(platform.displayName).toBe("Claude Code")
    expect(platform.cliBinary).toBe("claude")
    expect(platform.supportsAutoUpdate).toBe(true)
  })
})

describe("buildPluginUpdateCommands", () => {
  const build = platform.buildPluginUpdateCommands!

  it("defaults to user scope when scope detection returns nothing", () => {
    expect(build([])).toEqual([
      "claude plugin marketplace update bitfab",
      "claude plugin update bitfab@bitfab --scope user",
    ])
  })

  it("targets project scope when only installed at project scope", () => {
    expect(build(["project"])).toEqual([
      "claude plugin marketplace update bitfab",
      "claude plugin update bitfab@bitfab --scope project",
    ])
  })

  it("issues one update command per detected scope", () => {
    expect(build(["user", "project"])).toEqual([
      "claude plugin marketplace update bitfab",
      "claude plugin update bitfab@bitfab --scope user",
      "claude plugin update bitfab@bitfab --scope project",
    ])
  })
})
