import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-7A454NX4.js";
import {
  runUserPromptSubmit
} from "../chunks/chunk-YVG7IVUX.js";

// _target/dist/hooks/userPromptSubmit.js
await runUserPromptSubmit(getVersion(), platform, "claude-code");
