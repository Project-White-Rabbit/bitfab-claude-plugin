import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  PLUGIN_ROOT,
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-66LN6P6S.js";
import {
  readHookStdin,
  runCaptureHook,
  runSessionStart
} from "../chunks/chunk-LY5VLUE6.js";

// _target/dist/hooks/sessionStart.js
var input = readHookStdin();
await Promise.all([
  runSessionStart(getVersion(), platform, PLUGIN_ROOT, import.meta.url, input?.session_id),
  runCaptureHook("SessionStart", "claude-code", input, getVersion()).catch(() => {
  })
]);
