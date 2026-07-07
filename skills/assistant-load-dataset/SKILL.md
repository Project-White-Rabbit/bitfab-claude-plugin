---
name: assistant-load-dataset
description: Phase 5 Setup: Pick Dataset & Execution Mode phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Grep", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_datasets", "mcp__plugin_bitfab_Bitfab__list_experiments", "Skill"]
---

# Bitfab Assistant: Phase 5 Setup: Pick Dataset & Execution Mode

**Mode:** you were dispatched with a mode (`experiment` or `cost-optimize` or `benchmark` or `fix`); the gates and Next routing below depend on it.

Entry for `experiment`, `cost-optimize`, and `benchmark` modes, which skip the function picker and the dataset-building phases. Pick the dataset to run against, locate the code, and (in `experiment` / `cost-optimize` mode) choose parallel vs serial execution, then tail into Phase 5's replay loop at `detect-replay-capabilities`. `cost-optimize` first detours through its cost-diagnosis phase (`cost/diagnose`) between dataset-pick and execution-mode. `wizard` / `dataset` / `investigate` modes never pass through here, they reach `detect-replay-capabilities` directly from Phase 4. `fix` mode tails in at `pick-execution-mode` (it already resolved its code and diagnosed the failure in Phase Fix, so it skips `pick-dataset`; the dataset is picked or created later, in `fix-add-to-dataset`, only after the target trace passes).

1. **Run only when mode is `experiment`, `cost-optimize` or `benchmark`.**

   **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Running experiments"`.

   **Skip on re-entry (cost-optimize).** If you are returning to this phase from the cost-diagnosis phase (`cost/diagnose`) and already hold a picked `datasetId` with its traces loaded in working context, do NOT re-pick or re-load the dataset and do NOT branch back into `cost/diagnose`: skip this step entirely and continue to `pick-execution-mode` below. The dataset-pick runs once per run. (Under split-chain the cost phase tails back into this skill, which re-enters here at the top; this guard is what stops `pick-dataset → cost → pick-dataset` from looping.)

   The trace function key comes from the argument and no prior phase has run (on the first pass). Pick the dataset to run against (`experiment` and `cost-optimize` modes iterate against it; `benchmark` mode replays it once to measure the current code), then locate the code:

   1. **Grep the codebase** for the trace function key (e.g. `grep -r "<traceFunctionKey>" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.rb" --include="*.go" --include="*.baml"`) and note the file path. This is the code under test (the code you'll iterate on in `experiment` / `cost-optimize` mode, or measure as-is in `benchmark` mode).
   2. **Pick the dataset.** If a `<dataset-id>` argument was provided, use it directly. Otherwise call `mcp__plugin_bitfab_Bitfab__list_datasets` with the trace function key, present the result to the user via `AskUserQuestion`, and use their choice. Hold the chosen `datasetId` in working context.
   3. **Load it.** Run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" <trace-id...> --scope full` **once** with the dataset's trace IDs; it fans the reads out in parallel batches of 10 and writes the combined result to a temp file, then prints `{"status":"ok","outputFile":"..."}` as JSON, so `Read` that `outputFile` to load labels + annotations into context. **Use this command, not the `read_traces` MCP tool directly** (`read_traces` caps at 10 IDs).
   4. **Branch on the result. The usability gate depends on the mode:**
      - In `experiment` mode, the dataset must have **≥1 validated failing label** (there has to be something to fix).
      - In `benchmark` mode, the dataset just needs **≥1 trace**: benchmark replays the entire dataset against the current code regardless of label mix (an all-passing dataset is a valid regression baseline).
      - In `cost-optimize` mode, the dataset just needs **≥1 trace**: the goal is to cut tokens while holding quality, so an all-passing-but-expensive dataset is the common, valid case. The labeled traces (if any) guard the pass rate; the token usage on every trace is what the run optimizes.

   - **no datasets exist for this function (`list_datasets` returned empty), or the picked dataset fails the mode's usability gate (experiment: no validated failing labels; benchmark / cost-optimize: no traces at all)**: tell the user the function has no usable dataset yet and recommend running `/bitfab:assistant dataset <key>` first; then stop the flow (the cleanup step closes Studio if one was opened) → the `assistant-cleanup` skill
   - **dataset loaded (experiment: ≥1 validated failing label; benchmark / cost-optimize: ≥1 trace)**: summarize the dataset for the user (counts of pass/fail) and the failure annotations. In `experiment` mode, pick a first experiment from the failure patterns. In `benchmark` mode, confirm the dataset and proceed to replay the full set. In `cost-optimize` mode, confirm the dataset and proceed to the cost-diagnosis phase → the `assistant-cost` skill (mode `cost-optimize`); the `assistant-iterate` skill (mode `benchmark`); stop (mode `add-trace` or `replay`); otherwise step 2

   **Next:**

   - No datasets exist for this function (`list_datasets` returned empty), or the picked dataset fails the mode's usability gate (experiment: no validated failing labels; benchmark / cost-optimize: no traces at all) (mode `experiment` or `cost-optimize` or `benchmark`): invoke the `assistant-cleanup` skill with the current mode (`experiment` or `cost-optimize` or `benchmark`).
   - Dataset loaded (experiment: ≥1 validated failing label; benchmark / cost-optimize: ≥1 trace) (mode `experiment`): continue below in this skill.
   - Dataset loaded (experiment: ≥1 validated failing label; benchmark / cost-optimize: ≥1 trace) (mode `cost-optimize`): invoke the `assistant-cost` skill with mode `cost-optimize`.
   - Dataset loaded (experiment: ≥1 validated failing label; benchmark / cost-optimize: ≥1 trace) (mode `benchmark`): invoke the `assistant-iterate` skill with mode `benchmark`.
2. **Run only when mode is `experiment`, `cost-optimize` or `fix`.**

   **Decide once: parallel worktree subagents, or serial in this main agent.** The check is whether subagent worktree sessions would inherit bypass permissions.

   `.claude/settings.local.json` is gitignored and does NOT propagate into subagent worktrees, so it can't grant bypass. The two locations that DO propagate are committed `.claude/settings.json` and user-global `~/.claude/settings.json`. Run:

   ```bash
   python3 -c "
   import json, os
   def has_bypass(p):
       if not os.path.exists(p): return False
       try: d = json.load(open(p))
       except Exception: return False
       return (d.get('permissions') or {}).get('defaultMode') == 'bypassPermissions'
   p = has_bypass('.claude/settings.json')
   g = has_bypass(os.path.expanduser('~/.claude/settings.json'))
   print('parallel' if (p or g) else 'serial')
   "
   ```

   Hold the chosen mode in working context. Every iteration below (`make-change`, `replay-against-dataset`, `evaluate-results`) honors it.

   - **bash output is `parallel` (bypass found in committed or user-global settings)**: **Parallel mode.** For each independent experiment, fork to a subagent using the Agent tool with `isolation: "worktree"` and `subagent_type: "general-purpose"`. The subagent edits its worktree, runs replay, returns its scored items + `testRunId` to this main agent → the `assistant-iterate` skill
   - **bash output is `serial` (no bypass found)**: **Serial mode.** Iterate experiments one at a time in this main agent. Subagent worktrees wouldn't inherit bypass permissions, so their Edit tool would be denied → the `assistant-iterate` skill

   **Next:**

   - bash output is `parallel` (bypass found in committed or user-global settings) (mode `experiment` or `cost-optimize` or `fix`): invoke the `assistant-iterate` skill with the current mode (`experiment` or `cost-optimize` or `fix`).
   - bash output is `serial` (no bypass found) (mode `experiment` or `cost-optimize` or `fix`): invoke the `assistant-iterate` skill with the current mode (`experiment` or `cost-optimize` or `fix`).
