---
name: update-plugin
description: Update plugin phase of the Bitfab Update flow. Invoked by the update orchestrator; not run directly
user-invocable: false
---

# Bitfab Update: Update plugin

**Run only when mode is `all` or `plugin`.**

1. If the plugin was updated, remind the user to restart Claude Code to apply the update. If the mode was `plugin`, stop here — do not run the 1-7 steps of the SDK phase.
