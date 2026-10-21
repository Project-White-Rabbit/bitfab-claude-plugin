import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-ALF2PRJF.js";
import {
  runStartTemplatePreview
} from "../chunks/chunk-OU4ZSS67.js";

// _target/dist/commands/startTemplatePreview.js
runStartTemplatePreview(platform, getVersion()).catch((err) => {
  console.error("Failed to open template preview page:", err.message);
  process.exit(1);
});
