import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-WDFN5I7R.js";
import {
  runUserPromptSubmit
} from "../chunks/chunk-WXV4FSNP.js";

// _target/dist/hooks/userPromptSubmit.js
await runUserPromptSubmit(getVersion(), platform, "claude-code");
