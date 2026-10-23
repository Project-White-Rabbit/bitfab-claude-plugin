import { createRequire as __bitfabCreateRequire } from 'node:module'; const require = __bitfabCreateRequire(import.meta.url);
import {
  getVersion
} from "../chunks/chunk-FQSXOP32.js";
import {
  platform
} from "../chunks/chunk-FJEBLKFI.js";
import {
  detectLegacyInstall,
  legacyMigrationMessage,
  parseUpdateMode,
  runUpdate
} from "../chunks/chunk-2WVDTGQY.js";

// _target/dist/commands/update.js
async function main() {
  if (detectLegacyInstall(platform)) {
    console.log(legacyMigrationMessage(platform));
    return;
  }
  const mode = parseUpdateMode(process.argv[2]);
  await runUpdate(getVersion(), platform, mode);
}
main().catch((err) => {
  console.error("Update failed:", err.message);
  process.exit(1);
});
