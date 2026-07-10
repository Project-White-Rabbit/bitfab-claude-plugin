---
name: assistant-cost
description: Phase Cost: Diagnose Token Spend phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Grep", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__read_traces", "Skill"]
---

# Bitfab Assistant: Phase Cost: Diagnose Token Spend

**Run only when mode is `cost-optimize`.**

Reached only from `cost-optimize` mode, after `load-dataset/pick-dataset` has picked the dataset and located the code. `costRun` is always true in this mode (the mode exists to cut token cost), and `costBasis` was fixed at entry per the usual rules. The goal is to **lower token cost while holding the pass rate**: the labeled dataset is the regression guard, the token delta is the score. This phase profiles where the dataset's tokens actually go and turns that into a concrete, ordered list of token-reduction experiments, then hands off to `load-dataset/pick-execution-mode` so the shared replay loop (Phase 5) runs each one, persists verdicts, and reports the per-item and dataset-wide token delta on the run's basis so you can confirm cost dropped without a quality regression.

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Diagnosing token spend"`.

   **Profile where the tokens go, then plan reductions.** Ground every proposal in the actual token breakdown of this dataset's traces and in the code under test (located in `load-dataset/pick-dataset`).

   **1. Read the token breakdown.** The dataset's full traces were already loaded in `load-dataset/pick-dataset` (via `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/readTracesBatched.js" ... --scope full`); reuse that `outputFile`. Sort by recorded token usage and study the most expensive 3-5 traces. For each, see where the tokens go: `input` vs `output`, and how much of `input` is `cached` vs fresh. A run on `costBasis = uncached` cares about fresh `(input - cached) + output`; a run on `all` cares about raw `input + output`. Note the dominant cost driver per trace.

   **2. Read the code.** Read the instrumented function and the prompt/template it builds (follow the call chain; read any `.baml` files). Map each token sink from step 1 to a place in the code: a system prompt, retrieved/injected context, few-shot examples, the output schema, a verbose instruction block, an over-large `max_tokens`, or a model whose pricing dominates.

   **3. Categorize token-reduction experiments.** Turn the drivers into concrete experiments, ordered cheapest-to-try / highest-expected-saving first. Common levers (pick what the data supports, do not apply blindly):

   - **Prompt / context trimming**: drop redundant instructions, dedupe repeated context, shorten few-shot examples, cap or summarize retrieved context. Biggest lever when fresh `input` dominates.
   - **Prompt caching**: reorder the prompt so the large stable prefix (system prompt, schema, static context) is cacheable and the variable part comes last. Moves tokens from fresh to cached, which matters on the `uncached` basis even when the `all` total looks flat.
   - **Output shape**: tighten the output schema / instructions so the model emits less (the `output` side of the bill). Watch for quality loss.
   - **Model choice**: a smaller / cheaper model for this function, when the dataset shows the task is within its reach. A per-experiment swap, validated by the same pass-rate guard.

   Keep deterministic code cleanups (dead context assembly, accidental double-injection) as their own bundled first experiment, the same way Phase 4 treats code fixes: a foundation later experiments build on.

   **4. Present the plan and confirm.** Present the categorized, ordered plan via `AskUserQuestion`, leading with the cost framing:

   > "Token spend on `<key>` is concentrated in [driver, e.g. 'a 2k-token system prompt re-sent uncached every call']. Ranked experiments to cut it without regressing pass rate:
   >
   > 1. [Experiment]: [lever, expected token saving, which traces, hypothesis]
   > 2. ...
   >
   > I'll replay each against the labeled dataset and report the token delta (on the <all|uncached> basis) alongside pass/fail, so we only keep changes that cut cost without breaking quality."

   If the dataset has no validated labels (only the `≥1 trace` minimum), say so in this confirmation: the token delta is still measured, but pass-rate is then a weaker guard, recommend labeling a few traces (`/bitfab:assistant dataset <key>`) for a stronger guard. Get the user's confirmation, then continue to `load-dataset/pick-execution-mode`, which picks parallel vs serial execution and runs the first experiment.

   **Next:**

   - Mode `cost-optimize`: invoke the `assistant-load-dataset` skill with mode `cost-optimize`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
