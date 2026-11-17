import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-2R4ZZIEL.js";
import {
  runOpenExperiments
} from "../chunks/chunk-PQWRZVU6.js";

// _target/dist/commands/openExperiments.js
runOpenExperiments(platform).catch((err) => {
  console.error("Failed to open experiments page:", err.message);
  process.exit(1);
});
