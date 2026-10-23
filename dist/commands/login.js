import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-PA3C6C5G.js";
import {
  runLogin
} from "../chunks/chunk-6HCHIRT4.js";

// _target/dist/commands/login.js
runLogin(platform, getVersion()).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});
