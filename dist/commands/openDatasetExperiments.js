import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-FLVTNBWV.js";
import {
  runOpenDatasetExperiments
} from "../chunks/chunk-GP3GEVJS.js";

// _target/dist/commands/openDatasetExperiments.js
runOpenDatasetExperiments(platform).catch((err) => {
  console.error("Failed to open dataset experiments page:", err.message);
  process.exit(1);
});
