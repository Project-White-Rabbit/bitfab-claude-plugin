import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-KMZKZX7D.js";
import {
  runWaitForExperiment
} from "../chunks/chunk-NWNP2UAG.js";

// _target/dist/commands/waitForExperiment.js
runWaitForExperiment(platform, getVersion()).catch((err) => {
  console.error("Failed to wait for the experiment:", err.message);
  process.exit(1);
});
