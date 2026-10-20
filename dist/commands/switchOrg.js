import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-OYQQZJQE.js";
import {
  runSwitchOrg
} from "../chunks/chunk-H4TJOA2Z.js";

// _target/dist/commands/switchOrg.js
runSwitchOrg(platform).catch((err) => {
  console.error("Org switch failed:", err.message);
  process.exit(1);
});
