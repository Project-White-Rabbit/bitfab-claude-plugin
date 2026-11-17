import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-PYW3D55N.js";
import {
  runLogin
} from "../chunks/chunk-ZHB443YY.js";

// _target/dist/commands/login.js
runLogin(platform, getVersion()).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});
