---
description: Iterate on a traced function to improve pass rates using failed traces, labeling, and replay
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write", "Agent", "AskUserQuestion", "Skill", "mcp__plugin_bitfab_Bitfab__list_trace_functions", "mcp__plugin_bitfab_Bitfab__search_traces", "mcp__plugin_bitfab_Bitfab__read_traces", "mcp__plugin_bitfab_Bitfab__save_agent_labels"]
argument-hint: <trace-function-key>
---

# Bitfab Improve

Use the **local plugin MCP tools** (`mcp__plugin_bitfab_Bitfab__*`) to find what's failing in a traced function, gather labeled failed traces, then iterate on the code/prompts using replay until pass rates improve.

**MCP tools:** This skill uses `list_trace_functions`, `search_traces`, `read_traces`, and `save_agent_labels` from the **local plugin MCP server** (bundled with this plugin). Do NOT use the remote Bitfab MCP tools (`mcp__Simforge__*` or `mcp__Bitfab__*`) — use only the `mcp__plugin_bitfab_Bitfab__*` variants.

**Always use** `AskUserQuestion` **when asking questions, reporting results, or presenting choices.** Never print a question as text and wait. Rules:

- Recommend an option first, explain why in one line
- Present 2-5 concrete options
- One decision per question — never batch

## Phase 1: Identify the Trace Function

If a `traceFunctionKey` was provided as an argument, use it. Otherwise:

1. Call `mcp__plugin_bitfab_Bitfab__list_trace_functions` to list all available trace functions
2. For each function, include a brief description of what it does — infer from the function key name (e.g., `memory-search` → searches memories, `memory-extraction` → extracts memories from conversations). Keep descriptions to one sentence.
3. Present the full list to the user in the question text showing all functions with their keys and descriptions
4. Use `AskUserQuestion` with just 2 options: the recommended function (pick the one with the most recent activity or traces) and a free-text "Type a function key" option. The user can see the full list above and either accept the recommendation or type their choice.

## Phase 2: Verify Instrumentation & Replay

Check that this trace function has both instrumentation and a replay script.

### Check Instrumentation

Search the codebase for the trace function key to find where the SDK is used:

- TypeScript: `grep -r "<traceFunctionKey>" --include="*.ts" --include="*.tsx"`
- Python: `grep -r "<traceFunctionKey>" --include="*.py"`
- Ruby: `grep -r "<traceFunctionKey>" --include="*.rb"`
- Go: `grep -r "<traceFunctionKey>" --include="*.go"`

If the key is found, note the file location — this is the code you'll iterate on in later phases.

If the key is NOT found in the codebase, the function is instrumented elsewhere (the traces exist on Bitfab). Use `AskUserQuestion` to ask:

> "I can't find `<traceFunctionKey>` in this codebase — it may be instrumented in another repo or under a different key."
>
> Options: "Instrument now (Recommended)" — set up tracing in this codebase / "Continue anyway" — work with the traces even without local code / "Pick a different function" / "Stop"

If the user chooses **"Instrument now"**, invoke `/bitfab:setup instrument` using the Skill tool, then continue with Phase 2 Check Replay Script. If **"Continue anyway"**, skip to Phase 3 (dataset building) since there's no local code to iterate on yet.

### Check Replay Script

Search for a replay script that covers this trace function:

- Look for files matching `scripts/replay.*`, `scripts/*replay*`, or any file that imports `bitfab.replay` / `client.replay`
- Read the script and check that it maps the target trace function key

If a replay script exists but targets a different function key, do NOT modify the existing script or suggest changing the code's function key. Instead, treat it as "no replay script for this function" and offer to create a new one.

If no replay script exists or it doesn't cover this function, use `AskUserQuestion` to ask the user:

> "No replay script found for `<traceFunctionKey>`."
>
> Options: "Create replay now (Recommended)" — create the replay script inline / "Pick a different function" / "Stop"

If the user chooses **"Create replay now"**, invoke `/bitfab:setup replay` using the Skill tool, then continue with Phase 3.

## Phase 3: Build Dataset via Labeling

Build a dataset of labeled traces. **You** (the agent) label every candidate trace with your best-guess pass/fail verdict and a written annotation BEFORE the user ever sees the labeling UI. The user's job is to confirm or correct your verdicts, not to label from scratch. These labels and annotations become the benchmark for all experiments.

> 🚨 **HARD RULE — DO NOT SKIP:** You MUST call `mcp__plugin_bitfab_Bitfab__save_agent_labels` with verdicts for every approved trace BEFORE running `label.js` to open the UI. Sending the user into the labeling UI without pre-labeled verdicts is a process violation. If you find yourself about to run `label.js` and you have not yet called `save_agent_labels` for those trace IDs, STOP and label them first. This is non-negotiable — do not ask permission, do not "save time" by skipping, do not defer to the user.

1. **Gather already-labeled traces** — Use `mcp__plugin_bitfab_Bitfab__search_traces` with `labelSource: "human"` to find traces that already have human labels. These go directly into the dataset — no need to re-label.
2. **Find unlabeled traces** — Search again without label filters to find unlabeled traces. Use `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "summary"` to read them and identify which are worth labeling — look for diverse inputs, traces that produced output (not empty), and traces that cover different scenarios. Filter out near-duplicates and uninteresting traces (e.g., trivial inputs, system commands).
3. **Present candidates** — Use `AskUserQuestion` to show the user which unlabeled traces you recommend labeling and why. Include the already-labeled trace count for context (e.g., "4 traces already labeled, recommending 5 more for labeling"). Let the user approve, adjust, or skip.
4. **Label them yourself FIRST (mandatory before step 5)** — Once the user approves the candidate traces, **you** label them. Call `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "full"` on the approved trace IDs (batch them — up to 10 per call), read each trace's inputs / output / spans yourself, and decide for each one whether it looks like a PASS or a FAIL. **Ground your judgment in the codebase, not just the trace text.** Before you start labeling, read the instrumented function in the user's source (you found it in Phase 2) and any nearby code that explains intent — comments, docstrings, README sections, related tests, BAML files — so you know what the function is *supposed* to do and what "good" looks like for it. Apply the same context to every trace: does this output achieve the function's goal as expressed in the code? Does it match the patterns in the already-labeled traces? Then call `mcp__plugin_bitfab_Bitfab__save_agent_labels` once with an array of `{ traceId, label, annotation }` objects — **both `label` (true for pass, false for fail) and `annotation` (a one-or-two-sentence explanation written for the human reviewer, ideally referencing what the code is trying to do) are required for every trace**. Commit to a verdict — if you genuinely cannot decide, you didn't read the trace or the code carefully enough. This is your best guess, not a substitute for the human — they will see your verdicts as one-click suggestions in the labeling UI and can accept, change, or ignore each one. Do not skip this step, do not ask permission first, and do not advance to step 5 until `save_agent_labels` has returned successfully for every approved trace.
5. **Open the labeling UI (only after step 4 is done)** — Collect the approved trace IDs and run the label script to open the labeling page in the browser:
   ```bash
   node <plugin-dir>/dist/commands/label.js <traceId1> <traceId2> <traceId3> ...
   ```
   Where `<plugin-dir>` is the absolute path to the `bitfab-claude-plugin` directory. This opens the labeling UI in the browser and blocks until the user finishes labeling. The user labels each trace as pass/fail/skip and writes annotations explaining what went wrong or what the expected output should be.
6. **Wait for labeling to complete** — The label script blocks until the user finishes. It prints a summary when done (e.g., "Labeling complete: 8/10 traces labeled").
7. **Build the dataset** — Combine the already-labeled traces (step 1) with the newly-labeled traces (step 6). Call `mcp__plugin_bitfab_Bitfab__read_traces` with all trace IDs and `scope: "full"` to get the full dataset with labels and annotations.
8. **Confirm the dataset** — Present the dataset via `AskUserQuestion`: each entry showing (trace ID, label, annotation summary). The dataset must contain at least one failed trace — if all traces are passing, tell the user and go back to step 2 to find or label more traces. Get explicit approval before moving on.
9. **Hold in-context** — This approved dataset is the benchmark for all experiments in Phase 5. Keep it in your working context throughout.

## Phase 4: Diagnose & Plan

### Step 1: Understand Failures

Using the failed traces you read in Phase 3 (or read them now if you haven't):

1. Call `mcp__plugin_bitfab_Bitfab__read_traces` on 3–5 failed traces with `scope: "full"`

Synthesize the failure patterns — what's going wrong, what the common threads are.

### Step 2: Read the Code

1. Find the instrumented function in the codebase (you found it in Phase 2)
2. Read the full implementation — follow the call chain to understand the logic
3. Identify **iteration targets**: prompts, system messages, parameters, preprocessing, postprocessing
4. If BAML files are involved, read the relevant `.baml` files

### Step 3: Categorize fixes based on failure annotations

Based on the failure patterns, the code, and the labeled dataset from Phase 3, categorize proposed changes into three buckets:

**Bucket 1 — Code fixes**: Deterministic bugs (off-by-one, type mismatch, missing null check, wrong variable). These won't recur once fixed. Bundle all code fixes into a single experiment unless they are large feature changes. These are applied first as a foundation that all subsequent experiments build on.

**Bucket 2 — Judgment-based fixes**: Prompt changes, context truncation, search tuning, output formatting, etc. These require the user's judgment to evaluate correctness. Each gets its own experiment.

**Bucket 3 — Infrastructure proposals**: Larger changes that require new infrastructure, architectural changes, or significant feature work. These are separated out because experiments become harder to compare when some include large infra changes and others don't — apples-to-apples comparison requires a consistent baseline. Do not run experiments for these. Instead, if the user has integrations (Linear, Notion, Jira), propose creating a task with a clear writeup for future work.

Present the categorized plan via `AskUserQuestion`:

> "Based on the N traces in the dataset, here's what I see: \*\***Code fixes** (experiment #1 — bundled):
>
> - \[Fix\]: \[What and why, which traces it addresses\] \*\***Judgment-based experiments** (#2, #3, ...):
>
> - \[Experiment\]: \[What change, which traces it targets, hypothesis\] \*\***Future infrastructure** (not experiments):
>
> - \[Proposal\]: \[What it would require, which traces it would help\]
>
> I'll replay each experiment against the labeled dataset and evaluate using the annotations as acceptance criteria."

Get the user's confirmation before proceeding.

## Phase 5: Iterate with Replay

Run an iterative improvement loop. Fork as many experiments that do not rely on sequential results to subagents using the **Agent tool** with isolation: "worktree". Each iteration:

### Step 1: Make the Change

1. Use `AskUserQuestion` to explain what you're changing and why, and confirm before editing

2. Edit the iteration target (prompt, code, tools, parameters)

### Step 2: Replay Against Dataset

Collect the trace IDs from the labeled dataset (Phase 3). Run the replay script with those specific traces.

```bash
# The exact command depends on the replay script — adapt to what exists
# Example for TypeScript:
cd <project-dir> && npx tsx scripts/replay.ts <pipeline-name> --trace-ids <id1>,<id2>,<id3>,...
```

### Step 3: Evaluate Against Labels & Annotations

Read the replay output. For each trace in the dataset, use the label (pass/fail) and annotation from Phase 3 to judge whether the new output is an improvement:

- For traces labeled **fail**: Does the new output address the issue described in the annotation? The annotation explains what went wrong — use it as the acceptance criteria.
- For traces labeled **pass**: Did the replay preserve the correct behavior, or did it regress?
- Record the results into a tmp file if the dataset/context is too big so you can recall it later easily.
- Return the results of the sub agent if you are in one to the main agent.

### **Step 4: Share Results to the user**

> "After N experiments these are the results: X/Y traces now pass.
>
> - ✅ Trace `abc123`: Now passes — \[how the annotation's issue was resolved\]
> - ❌ Trace `def456`: Still failing — annotation said \[X\], output still \[Y\]
> - ❌⚠️ Trace `ghi789`: Was passing, now failing (regression)"
>
> Show this across the full data set, and highlight the best outcome concisely. Explain why it worked best with references to code, docs, and/or research if needed. For the best outcome:
>
> - **If pass rate improved and no regressions**: Use `AskUserQuestion` to ask the user if they want to keep iterating or stop
> - **If pass rate improved but regressions exist or no improvement**: Use `AskUserQuestion` to tell the user and propose to create a plan for new experiments and continue iterating.
>
> Ensure the `AskUserQuestion` you ask includes your recommended next step.

## Phase 6: Validate & Wrap Up

### Step 1: Summary

Use `AskUserQuestion` to present the final results similar to this. You may expand where appropriate based on context from the user:

> "**Improvement summary for** `<traceFunctionKey>`:
>
> - Failed traces fixed: X/Y (from N% → M% pass rate on labeled failures)
> - Full replay pass rate: A/B
> - Changes made:
>   - \[File\]: \[Description of change\]
>   - \[File\]: \[Description of change\]
>
> The changes are in your working tree (not committed). Review the diffs and commit when ready."
