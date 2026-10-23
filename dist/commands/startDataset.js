import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-PA3C6C5G.js";
import {
  runStartDataset
} from "../chunks/chunk-6HCHIRT4.js";

// _target/dist/commands/startDataset.js
runStartDataset(platform, getVersion()).catch((err) => {
  console.error("Failed to open dataset page:", err.message);
  process.exit(1);
});
