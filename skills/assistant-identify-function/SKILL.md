---
name: assistant-identify-function
description: Phase 1: Identify the Trace Function phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Glob", "Grep", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_trace_functions", "Skill"]
---

# Bitfab Assistant: Phase 1: Identify the Trace Function

**Run only when mode is `wizard`.**

If a `traceFunctionKey` was provided as an argument, skip the listing and the user prompt, but still cross-check the provided key against the local codebase before moving on. Otherwise, work through all four steps below:

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" started "Identifying trace function"`.

   **Skip this step if a `traceFunctionKey` argument was provided**: use the argument directly and continue to cross-check. Otherwise, call `mcp__plugin_bitfab_Bitfab__list_trace_functions` to list all available trace functions. Use **only** the keys and metadata returned (trace counts, last activity), do NOT invent or infer descriptions of what each function does from its key name. Key names are often ambiguous or misleading, and guessing produces hallucinated descriptions that confuse the user.
2. **Cross-check each key against the local codebase** before presenting. For each returned key, `grep` the repo for string-literal uses of that exact key (across `*.ts`, `*.tsx`, `*.py`, `*.rb`, `*.go`, `*.baml`). Mark each function in the presented list as:

   - **✅ instrumented here**: found in this repo, with the file path
   - **⚠️ not found in this repo**: traces exist on Bitfab but the key isn't in this codebase (likely another repo or a renamed key)
3. **Skip this step if a `traceFunctionKey` argument was provided**: there's no list to present. Otherwise, present the full list in the question text showing ONLY: `<key>` · `<trace count>` · `<last activity>` · `<instrumented-here marker + path, or not-found marker>`. No invented summaries.
4. **Skip this step if a `traceFunctionKey` argument was provided**: the function is already chosen. Otherwise, use `AskUserQuestion` with 2 options: the recommended function (prefer one that is ✅ instrumented here AND has recent activity) and a free-text "Type a function key" option. If nothing is instrumented here, say so explicitly in the question, don't hide it.

   **Next:**

   - Mode `wizard`: invoke the `assistant-verify-instrumentation` skill with mode `wizard`.
