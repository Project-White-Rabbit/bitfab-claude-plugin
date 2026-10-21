import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-WDFN5I7R.js";
import {
  runStartDataset
} from "../chunks/chunk-WXV4FSNP.js";

// _target/dist/commands/startDataset.js
runStartDataset(platform, getVersion()).catch((err) => {
  console.error("Failed to open dataset page:", err.message);
  process.exit(1);
});
