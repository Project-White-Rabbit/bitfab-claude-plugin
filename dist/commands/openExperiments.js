import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-6A3J462P.js";
import {
  runOpenExperiments
} from "../chunks/chunk-VVTU7GOX.js";

// _target/dist/commands/openExperiments.js
runOpenExperiments(platform).catch((err) => {
  console.error("Failed to open experiments page:", err.message);
  process.exit(1);
});
