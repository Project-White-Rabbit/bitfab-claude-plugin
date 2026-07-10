---
name: assistant-investigate
description: Phase Investigate: Free-form Investigation phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Read", "Glob", "Grep", "Write", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_trace_functions", "mcp__plugin_bitfab_Bitfab__search_traces", "mcp__plugin_bitfab_Bitfab__read_traces", "Skill"]
---

# Bitfab Assistant: Phase Investigate: Free-form Investigation

**Run only when mode is `investigate`.**

Reached only from `investigate` mode. The user is describing an issue they want to understand (a customer complaint, a suspected failure pattern, a regression, or an open-ended "is something off with this function" question). Read traces and code as needed to characterize the problem, then hand the user a choice: stop with the in-chat summary, write a markdown analysis report, or roll into building a labeled dataset (Phase 3).

1. Read what the user typed when they invoked `/bitfab:assistant investigate`. Two cases:

   - **They passed a function key as the argument:** use it. Call `mcp__plugin_bitfab_Bitfab__list_trace_functions` once to confirm the key exists and capture trace count + last activity for the explore step. Then grep the codebase for the key (`grep -r "<key>" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.rb" --include="*.go" --include="*.baml"`) and note the file path. Hold both in working context.
   - **They didn't pass a key:** read their description (failure pattern, customer complaint, "something seems off with X", etc.). First inspect the local instrumentation to infer likely function keys: grep for Bitfab SDK usage and wrappers (`@bitfab/sdk`, `withSpan`, `getFunction`, `traceable`, `observability/providers/bitfab`, replay scripts) plus domain terms from the user's description. If one key is clearly tied to the described workflow, hold it as the candidate and grep for its exact string. Then call `mcp__plugin_bitfab_Bitfab__list_trace_functions` to confirm whether the candidate has traces and to capture trace count + last activity. If code does not reveal a candidate, or multiple candidates remain plausible, use `list_trace_functions` as a fallback picker (recommend 2-4 alternatives by key, trace count, last activity, and code path when known). If nothing matches, ask the user to clarify or pass a key explicitly.

   Do NOT invent or infer descriptions of what each function does from its key name. Use only what `mcp__plugin_bitfab_Bitfab__list_trace_functions` returns plus what's in the codebase.
2. Free-form investigation: use whatever combination of MCP and local tools fits the user's described concern, subject to the Trace-first debugging rule above. Typical moves:

   - **Trace evidence:** call `mcp__plugin_bitfab_Bitfab__search_traces` with filters that match the user's description (failure shape, recency, label state, user / session if mentioned), then `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "summary"` or `scope: "full"` on the most informative ones.
   - **Code context:** read the instrumented function and its call chain. If BAML files, related prompts, or upstream / downstream functions matter to the question, read those too.
   - **Quantify if useful:** if the user asked something like "how often does X happen", run targeted `mcp__plugin_bitfab_Bitfab__search_traces` calls with different filters to count.

   Stop exploring once you can give the user a clear, evidence-backed account: what's going wrong (or "nothing obvious is going wrong"), when, how often, what the failure shape is, what code path is implicated, and one or two leading hypotheses. Hold the findings in working context for the next step. Cite specific trace IDs and code locations rather than vague summaries. If you could not read a relevant trace, cite the function key and search filters you tried and mark the diagnosis as code-only / lower confidence.
3. Share the findings inline with the user first, in chat, structured roughly as:

   > **What I looked at:** `<traceFunctionKey>` · `<N traces examined>` · `<filter criteria used>`
   >
   > **What I found:**
   >
   > - [Finding with cited trace IDs / code locations]
   > - [Finding with cited trace IDs / code locations]
   >
   > **Leading hypotheses:**
   >
   > - [Hypothesis, what would confirm it]

   Then use `AskUserQuestion` for the next step. Recommend based on what the investigation surfaced: option C (dataset) if the findings include reproducible failures worth labeling and iterating on, option B (report) if the user will need to share or revisit the findings later, option A (stop) if the question was a one-off and the chat summary already answers it.

   > A) **Stop here**: the in-chat summary is enough; no further artifact → the `assistant-cleanup` skill
   > B) **Write an analysis report**: save the findings to a markdown file I can share or revisit later → step 4
   > C) **Build a labeled dataset**: use these traces as seed candidates and label them so we can iterate against them later *(recommended)* → the `assistant-dataset` skill

   Options A and B end at the cleanup step, which closes Studio. Option C continues through dataset building, diagnosis, and experiments, with Studio staying open throughout until cleanup at wrap-up.

   **Next:**

   - Option A (Stop here) (mode `investigate`): invoke the `assistant-cleanup` skill with mode `investigate`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Build a labeled dataset) (mode `investigate`): invoke the `assistant-dataset` skill with mode `investigate`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
4. Write a markdown report capturing the investigation. Path: `.bitfab/analysis/<traceFunctionKey>-<YYYY-MM-DD-HHmm>.md` (create the `.bitfab/analysis/` directory if missing; fall back to a path under the repo root or `os.tmpdir()` if the project root isn't writable). Use the `Write` tool with this structure:

   ```markdown
   # Investigation: <traceFunctionKey>

   **Date:** <YYYY-MM-DD>
   **Question / concern:** <one-paragraph recap of what the user asked>

   ## What I looked at

   <filters used, trace counts, time window>

   ## Findings

   <bulleted findings, each citing trace IDs and code locations>

   ## Leading hypotheses

   <bulleted, each paired with what would confirm or refute it>

   ## Recommended next steps

   <concrete actions: build a dataset around hypothesis X, instrument span Y, ship a code fix for Z, etc.>
   ```

   After writing, tell the user the file path so they can open or share it, then stop (the cleanup step closes Studio). Do NOT roll into dataset building automatically; that is option C, not option B.

   **Next:**

   - Mode `investigate`: invoke the `assistant-cleanup` skill with mode `investigate`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
