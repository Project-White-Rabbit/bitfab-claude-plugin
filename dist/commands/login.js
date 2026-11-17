import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-SX24PH3T.js";
import {
  runLogin
} from "../chunks/chunk-UT6AOUPD.js";

// _target/dist/commands/login.js
runLogin(platform, getVersion()).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});
