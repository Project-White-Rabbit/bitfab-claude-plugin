import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-6LJPW73H.js";
import {
  runWatchRunningExperiments
} from "../chunks/chunk-LGXOSAIE.js";

// _target/dist/commands/watchRunningExperiments.js
runWatchRunningExperiments(platform, getVersion()).catch((err) => {
  console.error("Failed to watch running experiments:", err.message);
  process.exit(1);
});
