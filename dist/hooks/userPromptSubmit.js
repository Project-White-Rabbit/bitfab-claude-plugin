import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-EU4DQAHC.js";
import {
  runUserPromptSubmit
} from "../chunks/chunk-ARC5Q5YY.js";

// _target/dist/hooks/userPromptSubmit.js
await runUserPromptSubmit(getVersion(), platform, "claude-code");
