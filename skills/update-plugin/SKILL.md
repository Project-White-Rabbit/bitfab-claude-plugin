---
name: update-plugin
description: Update plugin phase of the Bitfab Update flow. Invoked by the update flow; not run directly
user-invocable: false
---

# Bitfab Update: Update plugin

**Mode:** you were dispatched with a mode (`all` or `plugin`); the gates and Next routing below depend on it.

**Run only when mode is `all` or `plugin`.**

1. If the plugin was updated, remind the user to restart Claude Code to apply the update. If the mode was `plugin`, stop here; do not run any step of the SDK phase.

   **Next:**

   - Mode `all`: invoke the `update-sdk` skill with mode `all`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `plugin`: stop here.
