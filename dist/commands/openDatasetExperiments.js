import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-KMZKZX7D.js";
import {
  runOpenDatasetExperiments
} from "../chunks/chunk-NWNP2UAG.js";

// _target/dist/commands/openDatasetExperiments.js
runOpenDatasetExperiments(platform).catch((err) => {
  console.error("Failed to open dataset experiments page:", err.message);
  process.exit(1);
});
