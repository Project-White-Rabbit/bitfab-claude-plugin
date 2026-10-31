import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  runCaptureHook
} from "../chunks/chunk-RMTK44JR.js";

// _target/dist/hooks/captureHook.js
await runCaptureHook(process.argv[2], "claude-code", void 0, getVersion());
