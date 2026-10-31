import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  runSessionLogConsent
} from "../chunks/chunk-D3TTHV2M.js";

// _target/dist/commands/sessionLogConsent.js
try {
  runSessionLogConsent(process.argv.slice(2));
} catch (err) {
  console.error("Session log consent failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
