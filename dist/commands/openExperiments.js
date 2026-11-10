import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  platform
} from "../chunks/chunk-3N45E4IP.js";
import {
  runOpenExperiments
} from "../chunks/chunk-JSUJDMLJ.js";

// _target/dist/commands/openExperiments.js
runOpenExperiments(platform).catch((err) => {
  console.error("Failed to open experiments page:", err.message);
  process.exit(1);
});
