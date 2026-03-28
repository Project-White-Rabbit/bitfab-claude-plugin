---
description: Open the trace labeling page to label a trace as pass/fail
allowed-tools: ["Bash"]
argument-hint: <trace-id>
---

# Simforge Label

Open the trace labeling page in the browser for a specific trace. The page shows the full trace with span tree navigation and a form to label it as pass or fail with notes.

## Usage

The user provides a trace ID as the argument. Run the label script with that ID:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/label.js" "<trace-id>"
```

After the script runs, confirm to the user that the labeling page was opened. Remind them to click "Done" when finished labeling so you can check the results.

If no trace ID is provided, ask the user for one. You can help them find trace IDs by searching traces using the Simforge MCP tools if available.
