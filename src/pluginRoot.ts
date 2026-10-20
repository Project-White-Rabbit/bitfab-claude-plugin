import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

function findPluginRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  let dir = here
  while (true) {
    if (fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return path.resolve(here, "..")
    }
    dir = parent
  }
}

export const PLUGIN_ROOT = findPluginRoot()
