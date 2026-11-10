import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "./chunks/chunk-FQSXOP32.js";
import {
  platform
} from "./chunks/chunk-EJ6KUKN6.js";
import {
  getConfig,
  startMcpServer
} from "./chunks/chunk-UPFHKOFT.js";

// _target/dist/mcpServer.js
startMcpServer(platform, getConfig, getVersion()).catch((err) => {
  console.error("Bitfab MCP server failed to start:", err);
  process.exit(1);
});
