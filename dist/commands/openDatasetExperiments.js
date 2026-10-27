import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-7BUZ47KU.js";
import {
  runOpenDatasetExperiments
} from "../chunks/chunk-WBK3DCOL.js";

// _target/dist/commands/openDatasetExperiments.js
runOpenDatasetExperiments(platform).catch((err) => {
  console.error("Failed to open dataset experiments page:", err.message);
  process.exit(1);
});
