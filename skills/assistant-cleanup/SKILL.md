---
name: assistant-cleanup
description: Cleanup phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash"]
---

# Bitfab Assistant: Cleanup

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `benchmark` or `replay` or `fix`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate`, `benchmark`, `replay` or `fix`.**

1. The requested workflow is complete.
