---
description: Set up Simforge tracing — authenticate and instrument your codebase
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write"]
---

# Simforge Setup

This skill handles the full Simforge onboarding: authentication and SDK instrumentation.

## Step 1: Check Authentication

Run the status check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js"
```

If the output says **"not authenticated"**, run the login script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/commands/login.js"
```

After successful login, confirm to the user and continue to Step 2.

## Step 2: Retrieve the API Key

Read the stored credentials to get the API key:

```bash
node -e "const fs = require('fs'), os = require('os'), p = require('path').join(os.homedir(), '.config', 'simforge', 'credentials.json'); try { console.log(JSON.parse(fs.readFileSync(p, 'utf-8')).apiKey) } catch { console.error('No credentials found') }"
```

Use this key for the `SIMFORGE_API_KEY` environment variable.

## Step 3: Check Existing Instrumentation

Before instrumenting, check whether Simforge is already set up in this codebase.

1. **Detect the project language** (TypeScript, Python, Ruby, or Go)
2. **Search for existing SDK usage:**
   - TypeScript: `grep -r "from \"@goharvest/simforge\"" --include="*.ts" --include="*.tsx"` or `withSpan` / `getFunction` calls
   - Python: `grep -r "from simforge import" --include="*.py"` or `@span` / `get_function` calls
   - Ruby: `grep -r "simforge_span\|Simforge::Traceable" --include="*.rb"` or `simforge_function` calls
   - Go: `grep -r "simforge-go" --include="*.go"` or `client.Span` / `client.Start` calls
3. **If instrumentation already exists:**
   - List the trace function keys and instrumented functions you found
   - Identify any AI workflows that are NOT yet instrumented
   - Ask the user: "I found existing Simforge instrumentation for these trace functions: [list]. There are [N] additional AI workflows that could be instrumented: [list]. Want me to instrument any of these?"
   - If the user says yes, proceed to the instrumentation prompt below for just the new workflows
   - If the user says no or everything is covered, skip to Step 4 (Replay Script)
4. **If no instrumentation exists**, proceed to the full instrumentation prompt below.

## Step 4: Replay Script Check

After instrumentation is complete (or was already present), check for a replay script. Replay scripts let the team regression-test any trace function against production data with one command — they use `simforge.replay()` / `client.replay()` to fetch historical traces, re-run them through the current code, and report old vs. new outputs side-by-side.

For replay API details, refer to the SDK documentation for the detected language (linked in Step 5).

1. **Search for an existing replay script:**
   - Look for files matching `scripts/replay.*`, `scripts/*replay*`, or any file that imports `simforge.replay` / `client.replay`
2. **If a replay script exists:**
   - Read it and extract the trace function keys / pipelines it covers
   - Compare against all trace function keys in the codebase
   - If any keys are missing: "Your replay script covers [X, Y] but is missing [Z]. Want me to add the missing functions?"
   - If all keys are covered: report that the replay script is up to date and move on
3. **If no replay script exists:**
   - Ask: "Want me to create a replay script? It lets you regression-test any trace function against production data with one command."
   - If yes, create the script. The script should:
     - Accept a pipeline name as a CLI argument
     - Accept optional `--limit N` (default 10) and `--trace-ids id1,id2` flags
     - Map pipeline names to trace function keys and their replay functions
     - Use a per-pipeline replay function for each trace function (important because replay deserializes historical inputs — if the function signature doesn't match the raw input shape, the wrapper reshapes arguments)
     - Call `simforge.replay()` / `client.replay()` and print results with delta summaries (original count → new count)
     - Print a summary (total replayed, same, changed, errors) and the test run URL
     - Live in a `scripts/` directory (or the project's existing scripts location)

## Step 5: Instrument the Codebase (if needed)

Follow the instrumentation prompt below. This is the same flow used by the Simforge setup page.

For detailed SDK documentation, refer to:
- **TypeScript SDK**: https://docs.simforge.goharvest.ai/typescript-sdk
- **Python SDK**: https://docs.simforge.goharvest.ai/python-sdk
- **Ruby SDK**: https://docs.simforge.goharvest.ai/ruby-sdk
- **Go SDK**: https://docs.simforge.goharvest.ai/go-sdk
- **Full documentation**: https://docs.simforge.goharvest.ai/introduction

---

## Instrumentation Prompt

Simforge captures every AI function call — inputs, outputs, and errors — so you can see exactly what your AI is doing and discover what's going wrong. The goal is to have enough context in each trace to tell whether a call succeeded or failed, and why.

Instrument this codebase with Simforge tracing:

1. Use the API key from Step 2 above.
2. Install the SDK (if not already installed) and set the SIMFORGE_API_KEY environment variable
3. Read the SDK documentation for the detected language (linked above). Read it carefully.
4. Read the codebase to understand the architecture and identify ALL AI workflows — every place the app makes LLM calls, runs agents, or makes AI-driven decisions
5. Present the user with a numbered list of workflows you found, ordered by value (most complex or most LLM-heavy first). For each, give the function name, a brief description, and why tracing it is valuable. Recommend one to start with and explain why. Ask which to instrument: a number, multiple numbers, or "all".
6. For each workflow the user selects, present your instrumentation plan as a tree diagram and wait for confirmation before writing code. Format:

```
Trace function: "<trace-function-key>"
  ├── outerFunction              [function]   ← enclosing workflow
  │   ├── llmCall                [llm]        ← LLM call
  │   ├── toolCall               [function]   ← tool/retrieval call
  │   └── anotherLlmCall         [llm]        ← LLM call
  Example input/output: <realistic example of what this trace would capture>
  Extra context: <runtime details you'll add — model, confidence, token counts, etc.>
  Not instrumented (and why): <functions you're skipping and why>
```

  When using a trace processor (e.g., OpenAI Agents SDK), show the plan like this instead:

```
Trace function: "my-agent"
  ├── runAgent                       [function]   ← withSpan outer wrapper around run()
  │   └── (captured by trace processor automatically)
  │       ├── LLM calls              [auto]
  │       ├── tool calls             [auto]
  │       └── handoffs               [auto]
  Setup: addTraceProcessor(processor) registered at startup
```

  Do NOT show individual tool/LLM functions as manual spans when using a trace processor — they are captured automatically.

7. Instrument the code following the SDK documentation exactly. Do NOT modify the original function's logic in any way — instrumentation is purely additive. Never change behavior, arguments, return values, error handling, variable names, types, control flow, or code structure. The only changes should be adding tracing calls around existing code.
8. Tell the user how to run the app to generate the first trace — give them the exact command(s). Do NOT run the app yourself.
9. Show a tree diagram of what you instrumented (same format as step 6), explain what visibility each trace gives you, and ask: "Want me to instrument another workflow, or all remaining workflows?" — then repeat steps 6–9.
10. After all instrumentation is done, return to Step 4 (Replay Script Check) to ensure the replay script is set up.
