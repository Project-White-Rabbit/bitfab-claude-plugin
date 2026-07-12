---
name: setup-view
description: View phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Glob", "Grep", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__get_trace_plan", "Skill"]
---

# Bitfab Setup: View

**Run only when mode is `view`.**

Open the trace planner UI for an **existing** trace function, read-only. Triggered explicitly by `/bitfab:setup view`. Useful for inspecting what's currently captured (tree shape, captured node ids, sample inputs/outputs) without making any code edits.

Every View invocation targets **exactly one** trace function. The browser UI's Confirm/Cancel controls have no effect here, the user is just looking at the plan.

1. **Gather existing trace functions** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). List each key alongside its root function (or, for keys registered only via a framework handler, the handler registration site, handler keys have no decorated root and that is expected). If none are found, tell the user View needs existing instrumentation and suggest `/bitfab:setup instrument`.

   **Next:**

   - No instrumented trace functions exist (nothing to view) (mode `view`): invoke the `setup-cleanup` skill with mode `view`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
2. **Pick exactly ONE trace function to view.** Use `AskUserQuestion` with the list of existing keys. Recommend the one the user most recently instrumented (or the one most recently referenced in the current session) and explain why in one line.
3. Call `mcp__plugin_bitfab_Bitfab__get_trace_plan` with `{ traceFunctionKey: "<chosen key>" }` (no `planId`). Two outcomes:

   - **Prior plan found**: parse the response for the `Plan id:` line and hold that id for the next step. Take branch **A** (Open).
   - **"No prior confirmed trace plan found"**: there is no plan to view (key created outside the skill, never confirmed, or never instrumented via this skill). Tell the user there's nothing to view yet and suggest `/bitfab:setup modify` to build and confirm a plan for this key. Take branch **B** (Stop).

   **Next:**

   - Option B (Stop) (mode `view`): invoke the `setup-cleanup` skill with mode `view`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
4. Open the trace plan in the browser by running:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openTracePlan.js" <planId>
   ```

   (`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin directory; `<planId>` is the id parsed from step 3.) The script emits JSONL to stdout. If it emits `{"event":"window-open-requested","url":"..."}`, immediately surface the URL in a normal chat message, e.g. `Opening Studio: <url> - click it if a window doesn't appear`, before continuing to poll. (This event means the open was *requested*, not that a window is confirmed on screen; the link is the reliable fallback when nothing surfaces.) `{"event":"session-ready","sessionId":"<uuid>"}` appears once the Studio session is established (on a logged-out run, an `{"event":"auth-required",...}` then `{"event":"authenticated",...}` line precede it, keep waiting for `session-ready`). The script navigates Studio to the trace plan page and **blocks** until the user closes Studio or clicks Confirm/Cancel. View is read-only; whichever button the user clicks (the final JSONL line will be `{"event":"confirmed",...}` or `{"event":"cancelled",...}`), do **not** apply edits or call `mcp__plugin_bitfab_Bitfab__get_trace_plan` again. When the process exits, report that the plan was viewed and stop.

   **Next:**

   - Mode `view`: invoke the `setup-cleanup` skill with mode `view`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
