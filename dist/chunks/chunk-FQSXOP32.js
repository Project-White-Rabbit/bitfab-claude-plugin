import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);

// _target/dist/pluginRoot.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function findPluginRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  while (true) {
    if (fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(here, "..");
    }
    dir = parent;
  }
}
var PLUGIN_ROOT = findPluginRoot();

// _target/dist/version.js
import fs2 from "node:fs";
import path2 from "node:path";
var PLUGIN_VERSION = JSON.parse(fs2.readFileSync(path2.join(PLUGIN_ROOT, "package.json"), "utf-8")).version;
function getVersion() {
  return PLUGIN_VERSION;
}

export {
  PLUGIN_ROOT,
  getVersion
};
