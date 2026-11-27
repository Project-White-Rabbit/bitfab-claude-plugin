import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-5DN4NDQD.js";
import {
  runWatchRunningExperiments
} from "../chunks/chunk-VMAJBUSN.js";

// _target/dist/commands/watchRunningExperiments.js
runWatchRunningExperiments(platform, getVersion()).catch((err) => {
  console.error("Failed to watch running experiments:", err.message);
  process.exit(1);
});
