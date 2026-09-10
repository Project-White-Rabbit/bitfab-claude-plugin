---
name: setup-modify
description: Modify phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "AskUserQuestion", "Skill"]
---

# Bitfab Setup: Modify

**Mode:** you were dispatched with a mode (`wizard` or `instrument` or `modify`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard`, `instrument` or `modify`.**

Adjust an **existing** trace setup. Requires existing SDK usage in the codebase, if none exists, run Instrument first. Triggered explicitly by `/bitfab:setup modify`, or selected from the AskUserQuestion at Instrument's existing-SDK-usage menu when existing SDK usage is found.

Every Modify cycle targets **exactly one** trace function. Never batch multiple trace functions in one cycle, if the user wants more, loop via the step 5 menu.

1. **Skip the search when you already hold the keys**: arriving from Instrument's existing-SDK-usage menu means you ran exactly this search one step ago, and re-running it makes the user watch the same greps twice for the same answer. Otherwise **gather existing trace functions** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). List each key alongside its root function (or, for keys registered only via a framework handler, the handler registration site, handler keys have no decorated root and that is expected). If none are found, tell the user Modify needs existing instrumentation and suggest `/bitfab:setup instrument`.

   - **the key is already settled (passed as `/bitfab:setup modify <key>`, or named at Instrument's existing-SDK-usage menu)**: skip the which-function question, the user already answered it → step 3
   - **no instrumented trace functions exist (nothing to modify)**: continue → the `setup-cleanup` skill
   - **one or more trace functions exist**: continue → step 2

   **Next:**

   - No instrumented trace functions exist (nothing to modify) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
2. **Pick exactly ONE trace function to modify.** (You only reach this step when the key is not already settled; a key named at Instrument's existing-SDK-usage menu or passed as `/bitfab:setup modify <key>` routes past it.) Use `AskUserQuestion` with the list of existing keys. Recommend the one the user most recently instrumented (or the one most recently referenced in the current session) and explain why in one line.
3. Read the chosen function, its root registration, wrappers, framework handler or processor, keyed client, and replay registry module directly from the current source. Inventory the captured calls and replay mocks that actually exist. The code is the source of truth. Reuse the existing function key and preserve unrelated user edits. Apply the requested change after checking the affected call signatures and replay dependencies.
4. Apply the user-requested instrumentation changes to the current source. Follow the SDK reference and the existing framework integration. Preserve behavior, arguments, return values, error handling, and streaming semantics. Keep the same trace function key unless the user requested a rename, and update the replay registry module in the same change so it calls the production traced root with reconstructed dependencies. If the request requires a behavior-changing refactor, follow the refactor-confirmation appendix before making that refactor. Validate the affected code and report exactly what changed.
5. Tell the user how to run the app to generate a trace with the modified setup, exact command(s). Do NOT run it yourself. Then **MANDATORY STOP**: use `AskUserQuestion`:
   > We recommend **A**: generate a trace with the modified setup so the diff is observable end-to-end.

   > A) **Generate a trace for the modified setup**: present the script to run; allow the user to let you run it *(recommended)* → the `setup-cleanup` skill
   > B) **Modify another trace function**: pick another traced function to adjust → step 2
   > C) **Done**: stop here → the `setup-cleanup` skill

   B returns to step 2. A and C exit the Modify loop to cleanup (Modify does not auto-continue to Replay, the user can invoke `/bitfab:setup replay` separately).

   **Re-entry rule:** If the user requests another instrumentation change, read that workflow from current source and apply the requested change through this skill.

   **Next:**

   - Option A (Generate a trace for the modified setup) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Option C (Done) (mode `wizard` or `instrument` or `modify`): invoke the `setup-cleanup` skill with the current mode (`wizard` or `instrument` or `modify`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
