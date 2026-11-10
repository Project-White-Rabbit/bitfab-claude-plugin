import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-JH7C5N7V.js";
import {
  runSwitchOrg
} from "../chunks/chunk-CC7ZUUV4.js";

// _target/dist/commands/switchOrg.js
runSwitchOrg(platform).catch((err) => {
  console.error("Org switch failed:", err.message);
  process.exit(1);
});
