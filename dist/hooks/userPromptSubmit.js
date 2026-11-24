import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-GQE4CRRI.js";
import {
  runUserPromptSubmit
} from "../chunks/chunk-NDUM3FT6.js";

// _target/dist/hooks/userPromptSubmit.js
await runUserPromptSubmit(getVersion(), platform, "claude-code");
