import { runCaptureHook } from "bitfab-plugin-lib";
import { getVersion } from "../version.js";
await runCaptureHook(process.argv[2], "claude-code", undefined, getVersion());
