import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-EU4DQAHC.js";
import {
  runOpenDatasetExperiments
} from "../chunks/chunk-ARC5Q5YY.js";

// _target/dist/commands/openDatasetExperiments.js
runOpenDatasetExperiments(platform).catch((err) => {
  console.error("Failed to open dataset experiments page:", err.message);
  process.exit(1);
});
