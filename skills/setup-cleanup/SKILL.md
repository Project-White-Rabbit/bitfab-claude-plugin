---
name: setup-cleanup
description: Cleanup phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash"]
---

# Bitfab Setup: Cleanup

**Mode:** you were dispatched with a mode (`wizard` or `explain` or `login` or `session-logs` or `instrument` or `modify` or `inspect` or `switch-org` or `replay` or `db-snapshot` or `templates` or `analyze-repo`); which steps apply and where they route below depend on it.

1. The requested setup work is complete.
