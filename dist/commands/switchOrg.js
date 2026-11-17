import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-5P75QFG5.js";
import {
  runSwitchOrg
} from "../chunks/chunk-DEZU6UAK.js";

// _target/dist/commands/switchOrg.js
runSwitchOrg(platform).catch((err) => {
  console.error("Org switch failed:", err.message);
  process.exit(1);
});
