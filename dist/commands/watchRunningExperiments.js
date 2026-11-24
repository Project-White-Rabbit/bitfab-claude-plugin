import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-PUWVGGU7.js";
import {
  runWatchRunningExperiments
} from "../chunks/chunk-S77AWSIL.js";

// _target/dist/commands/watchRunningExperiments.js
runWatchRunningExperiments(platform, getVersion()).catch((err) => {
  console.error("Failed to watch running experiments:", err.message);
  process.exit(1);
});
