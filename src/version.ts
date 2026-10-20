import fs from "node:fs"
import path from "node:path"
import { PLUGIN_ROOT } from "./pluginRoot.js"

const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_ROOT, "package.json"), "utf-8"),
).version as string

export function getVersion(): string {
  return PLUGIN_VERSION
}
