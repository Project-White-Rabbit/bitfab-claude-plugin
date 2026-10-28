import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  PLUGIN_ROOT,
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-4STR6QPL.js";
import {
  runStatus
} from "../chunks/chunk-KDD5MHG3.js";

// _target/dist/commands/status.js
runStatus(getVersion(), platform, PLUGIN_ROOT, import.meta.url).catch((err) => {
  console.error("Status check failed:", err.message);
  process.exit(1);
});
