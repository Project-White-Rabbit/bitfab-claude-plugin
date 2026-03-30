---
description: Open the trace labeling page to label one or more traces as pass/fail
allowed-tools: ["Bash"]
argument-hint: <trace-id> [trace-id2] [trace-id3] ...
---

# Bitfab Label

Open the trace labeling page in the browser. Supports labeling a single trace or multiple traces in sequence. When multiple traces are provided, the page shows a queue with progress tracking and "Save & Next" navigation.

## Usage

The user provides one or more trace IDs as arguments. Run the label script with those IDs:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/label.js" "<trace-id>" ["<trace-id2>"] ["<trace-id3>"]
```

After the script runs, confirm to the user that the labeling page was opened. If multiple traces were provided, mention how many traces are queued for labeling. Remind them to complete labeling so you can check the results.

If no trace ID is provided, ask the user for one. You can help them find trace IDs by searching traces using the Bitfab MCP tools if available.
