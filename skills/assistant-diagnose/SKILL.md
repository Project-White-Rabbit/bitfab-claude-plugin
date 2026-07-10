---
name: assistant-diagnose
description: Phase 4: Diagnose & Plan phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__read_traces", "Skill"]
---

# Bitfab Assistant: Phase 4: Diagnose & Plan

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `investigate`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `dataset` or `investigate`.**

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Diagnosing failures"`.

   **Understand failures.** Using the failed traces you read in Phase 3 (or read them now if you haven't):

   - Call `mcp__plugin_bitfab_Bitfab__read_traces` on 3–5 failed traces with `scope: "full"`

   Synthesize the failure patterns, what's going wrong, what the common threads are.
2. **Read the code.**

   - Find the instrumented function in the codebase (in `wizard` mode you found it in Phase 2; in `dataset` mode you grepped for the key in Phase 3's intro; in `investigate` mode you found it in Phase Investigate's gather-context step)
   - Read the full implementation, follow the call chain to understand the logic
   - Identify **iteration targets**: prompts, system messages, parameters, preprocessing, postprocessing
   - If BAML files are involved, read the relevant `.baml` files
3. **Categorize fixes based on failure annotations.** Based on the failure patterns, the code, and the labeled dataset from Phase 3, categorize proposed changes into three buckets:

   **Bucket 1, Code fixes**: Deterministic bugs (off-by-one, type mismatch, missing null check, wrong variable). These won't recur once fixed. Bundle all code fixes into a single experiment unless they are large feature changes. These are applied first as a foundation that all subsequent experiments build on.

   **Bucket 2, Judgment-based fixes**: Prompt changes, context truncation, search tuning, output formatting, etc. These require the user's judgment to evaluate correctness. Each gets its own experiment.

   **Bucket 3, Infrastructure proposals**: Larger changes that require new infrastructure, architectural changes, or significant feature work. These are separated out because experiments become harder to compare when some include large infra changes and others don't, apples-to-apples comparison requires a consistent baseline. Do not run experiments for these. Instead, if the user has integrations (Linear, Notion, Jira), propose creating a task with a clear writeup for future work.

   Present the categorized plan via `AskUserQuestion`:

   > "Based on the N traces in the dataset, here's what I see:
   >
   > **Code fixes** (experiment #1, bundled):
   >
   > - [Fix]: [What and why, which traces it addresses]
   >
   > **Judgment-based experiments** (#2, #3, ...):
   >
   > - [Experiment]: [What change, which traces it targets, hypothesis]
   >
   > **Future infrastructure** (not experiments):
   >
   > - [Proposal]: [What it would require, which traces it would help]
   >
   > I'll replay each experiment against the labeled dataset and evaluate using the annotations as acceptance criteria."

   Get the user's confirmation before proceeding.

   **Next:**

   - Mode `wizard` or `dataset` or `investigate`: invoke the `assistant-iterate` skill with the current mode (`wizard` or `dataset` or `investigate`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
