---
name: assistant-auth
description: Authentication phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "Skill"]
---

# Bitfab Assistant: Authentication

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `benchmark`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate` or `benchmark`.**

Authenticate before accessing organization resources.

1. Check authentication with node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js". If unauthenticated, invoke the setup login workflow and relay its sign-in link. Once authenticated, continue to the selected mode. No browser interaction is required to navigate between workflow steps.

   **Next:**

   - Mode `wizard`: invoke the `assistant-identify-function` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `dataset`: invoke the `assistant-dataset` skill with mode `dataset`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `experiment` or `cost-optimize` or `benchmark`: invoke the `assistant-load-dataset` skill with the current mode (`experiment` or `cost-optimize` or `benchmark`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `investigate`: invoke the `assistant-investigate` skill with mode `investigate`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
