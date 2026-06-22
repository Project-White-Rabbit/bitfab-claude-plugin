---
name: setup-inspect
description: Inspect phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__list_trace_functions", "mcp__plugin_bitfab_Bitfab__search_traces", "Skill"]
---

# Bitfab Setup: Inspect

**Run only when mode is `inspect`.**

Diagnose, and optionally fix, an existing Bitfab tracing setup. Triggered explicitly by `/bitfab:setup inspect` (or natural-language asks like "why aren't my traces showing up" / "what's instrumented" / "debug my tracing setup" / "inspect my tracing"). Reports auth/connection status, what's instrumented in this repo, whether the plugin and SDK are up to date, whether replay scripts cover every trace function key, and whether traces are actually arriving, then offers to apply the fixes, each confirmed individually before any change. Does **not** open Studio.

This is about trace *delivery and setup health* (is the SDK wired up and current, is the key set, are traces landing, are replay scripts in place). For improving the *quality* of a traced function's outputs (pass rates, failing cases), use `/bitfab:assistant` instead.

1. Run the status check and report the result to the user:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js"
   ```

   Report whether they're authenticated and which org/account the plugin is connected to. If **not authenticated**, note that trace arrival can't be confirmed without login and suggest `/bitfab:setup login`, but continue with the read-only code inspection below regardless (it does not require auth).
2. Search the codebase for SDK usage and trace function keys (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`, plus keyed framework handlers: `getLangGraphCallbackHandler("key")` / `get_langgraph_callback_handler("key")` (or the LangChain-named aliases) and `getOpenAiAgentHandler("key")` / `get_openai_agent_handler("key")` and `getClaudeAgentHandler("key")` / `get_claude_agent_handler("key")` and `getVercelAiMiddleware("key")`; plus trace-processor registrations (unkeyed in code, the key is derived server-side from the workflow name): `getOpenAiTracingProcessor()` / `get_openai_tracing_processor()`). In a monorepo, search **each application directory separately**: a root-level search can miss subdirectories. Report:
   - Whether the SDK is installed (check the package manifest) and whether `BITFAB_API_KEY` is set (in `.env`-style files or the environment), do **not** print the key value.
   - Each trace function key found, alongside its root function and file path.
   - **Trace-processor registrations (OpenAI Agents SDK) too**, even though they are unkeyed in code: the registration site (`setTraceProcessors` / `set_trace_processors` with the Bitfab processor) is itself an instrumented workflow whose key is derived server-side from the workflow name. Note whether each run is routed through the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`) or wrapped in a manual `withSpan`/`@span` root, the replayability check in step 4 needs this (a bare processor over plain `run()` with neither is not replayable).
   - Whether instrumentation routes through a project-local shim (e.g. `lib/bitfab.*`).

   If no SDK usage is found, say so and suggest `/bitfab:setup instrument` to wire up the first workflow. Continue through the remaining steps anyway, with no trace function keys, the trace-arrival check (step 3) has nothing to look up and is a no-op, but the freshness check (step 4) still matters: plugin and SDK staleness, including the legacy `bitfab` → `@bitfab/sdk` migration, apply regardless of whether this repo has any trace functions yet.
3. For each trace function key found in step 2, check whether traces are actually landing in Bitfab:
   - Call `mcp__plugin_bitfab_Bitfab__list_trace_functions` to see which keys the org has received traces for. Cross-reference against the keys instrumented in this repo: a key present in code but absent here usually means traces have never reached Bitfab (app not run with the key set, or the key is bound to a different org).
   - For keys that do exist, call `mcp__plugin_bitfab_Bitfab__search_traces` with `{ traceFunctionKey: "<key>", limit: 1 }` to confirm a recent trace and capture its timestamp.

   Mark each key as ✅ traces arriving (with most recent timestamp), ⚠️ instrumented here but no traces yet, or ❓ traces exist in the org but the key isn't found in this repo. If not authenticated (from step 1), skip the tool calls and note that arrival can't be checked until login.
4. Check whether the plugin, SDK, and replay scripts are current, so the report can offer to fix what's stale:

   1. **Plugin**: reuse the `status` output already captured in the status-check step (step 1). If that status line included `v<X> available, run ... to update`, the plugin is behind.
   2. **SDK**: run the version check (the same mechanism `/bitfab:update` uses):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/update.js" sdk
   ```

      Parse the `<bitfab-sdk-status>` block it prints, one JSON object per (workspace, language) with `packageName`, `current`, `latest`, `latestSource` ("remote" | "baked"), `updateAvailable`, and `renameFrom`. Treat `updateAvailable: true` as needing a fix, that flag is set both when `latest > current` **and** when `renameFrom` is non-null. A non-null `renameFrom` (e.g. `"bitfab"`) means the TypeScript workspace is on the **legacy `bitfab` npm package and must switch to `@bitfab/sdk`**; this counts as needing a fix even when the installed version already equals `latest` (the rename itself is the fix). If `remoteCheckFailed` is true for an entry, note the latest version couldn't be confirmed (offline / sandbox) rather than asserting it's current.
   3. **Replay scripts**: the same coverage check `/bitfab:assistant` runs in its Phase 2: Glob for `scripts/replay.*` (or the project's replay entrypoint) and grep it for each trace function key found in step 2. Mark replay as ✅ covers all keys, ⚠️ exists but missing keys, or ❌ no replay script.
   4. **Replayability of each root**: script coverage is only half of replay, a script that wraps a non-replayable root still won't run. Determine each key's replayability statically from source (this step does not fetch recorded trace inputs, so reason from signatures, not trace data):
      - **Keyed root-handler keys** (registered through a callback handler or a trace-processor run wrapper, LangGraph / LangChain, OpenAI Agents SDK, Claude Agent SDK, or Vercel AI SDK, with no `@span`/`withSpan`-decorated root in the app) are replayable by design: the handler (or run wrapper, `getOpenAiAgentHandler` / `get_openai_agent_handler`) records the framework's own serializable input as the root. Never flag these ⚠️, and never treat the absence of a decorated root function as non-replayable (this mirrors Instrument's rule).
      - **Bare trace-processor keys** (OpenAI Agents SDK over plain `run()`): the processor captures the run but its root span records an empty input, so a processor-only key (neither the run wrapper `getOpenAiAgentHandler` / `get_openai_agent_handler` nor a manual `withSpan`/`@span` root) is NOT replayable, flag it ⚠️ root not replayable and recommend routing the run through the run wrapper (or adding a manual root that takes the run input). If the key DOES go through the run wrapper or a manual root, check that root's signature like any decorated key (next bullet).
      - **Decorated/wrapped keys**: read the root function signature and confirm it's replayable per Instrument's trace-boundary serializability gate (serializable inputs). Flag any key whose root takes unserializable inputs (live SDK/DB clients, HTTP `Request`/`Response`, stream writers, sockets, opaque request contexts) as ⚠️ root not replayable, reasoning from the signature, not the function name. This is independent of the replay-script coverage in sub-step 3 above: a non-replayable root is ⚠️ whether or not a script exists for it (a key can be ❌ no replay script AND ⚠️ root not replayable at once), so never roll a non-replayable root up into ✅ just because it has no script.

   Hold these results for the report. (If nothing is instrumented, no trace function keys AND no trace-processor registrations, skip both the **replay** and the **replayability** checks, they are per-workflow, so there's nothing to evaluate; report both as `n/a (nothing instrumented)`, never ✅. Still run the **plugin** and **SDK** checks: the SDK may be installed and stale, or on the legacy `bitfab` package needing the `@bitfab/sdk` rename, independent of whether any trace functions exist in this repo yet.)
5. Summarize the setup health in one compact report:
   - **Auth**: authenticated as <account/org>, or not authenticated.
   - **Plugin**: up to date, or `v<X> available` (from step 4).
   - **SDK**: installed / not installed; `BITFAB_API_KEY` set / not set; per workspace, `current → latest` when out of date, **and** call out any workspace on the legacy `bitfab` package that should switch to `@bitfab/sdk` (TypeScript, from `renameFrom`).
   - **Instrumented here**: the list of keys with ✅ / ⚠️ / ❓ markers from step 3.
   - **Replay**: ✅ covers all keys / ⚠️ missing keys / ❌ none (from the replay-scripts check in step 4).
   - **Replayable**: ✅ all roots replayable / ⚠️ `<key>` root not replayable / `n/a (nothing instrumented)` (from the per-root replayability check in step 4; flagged whether or not a replay script exists for the key; never ✅ when nothing is instrumented).

   Then, for anything not healthy, name the most likely cause and the fix:
   - **Plugin or SDK out of date, or on the legacy `bitfab` package**: apply via the fix prompt below (upgrades the version and/or switches `bitfab` → `@bitfab/sdk`; same effect as `/bitfab:update`).
   - **Replay missing or incomplete**: refresh via `/bitfab:setup replay` (non-interactive; creates/extends scripts to cover every key).
   - **Root not replayable**, two failure modes, with the fix matched to each: **(a) the root takes unserializable inputs** (live SDK/DB clients, HTTP req/res, streams, opaque contexts), with or without a replay script: move the trace boundary inward to a serializable-input function or refactor to introduce one; **(b) a bare trace-processor-only key** (OpenAI Agents SDK) whose root is the processor's empty-input span: route the run through the run wrapper (`getOpenAiAgentHandler` / `get_openai_agent_handler`), or add a manual `withSpan`/`@span` root that wraps the run and takes its input. Either way, re-instrument via `/bitfab:setup modify` (or `/bitfab:setup instrument` for a fresh boundary). This is a code change, recommended here, not applied blanket.
   - **Instrumented but no traces**: the app hasn't run with tracing enabled, or `BITFAB_API_KEY` isn't set in the run environment. Run the app (or the replay script) with the key loaded.
   - **Key set but traces aren't visible in the browser**: the API key is bound to a different Clerk org/tenant than the browser session. A key resolves `API key → organization_id → clerk_organization_id → Clerk tenant` at creation time; browser visibility requires both to be the same tenant.
   - **Nothing instrumented**: run `/bitfab:setup instrument`.
   - **Want to change what's captured**: run `/bitfab:setup modify`; to see a plan visually, `/bitfab:setup view`.

   Then continue to the fix prompt. Inspect does not open Studio.
6. If the report surfaced anything stale or missing (plugin behind, SDK out of date or on the legacy `bitfab` package, or replay scripts missing/incomplete), use `AskUserQuestion` whether to apply them, each fix is then confirmed individually in the next step (nothing is changed blanket). If everything is healthy, skip the question and go straight to cleanup.

   > A) **Review and apply fixes**: go through each fix one at a time, confirming before any change *(recommended)* → step 7
   > B) **Just report**: make no changes → the `setup-cleanup` skill

   **Next:**

   - Everything is already healthy (nothing to fix) (mode `inspect`): invoke the `setup-cleanup` skill with mode `inspect`.
   - Option B (Just report) (mode `inspect`): invoke the `setup-cleanup` skill with mode `inspect`.
7. **Apply fixes individually, confirm each before changing anything; never bundle them into one blanket change.** Go through only the items step 4 flagged as stale or missing, and for each, use `AskUserQuestion` (one decision per question) and apply only if the user approves. Skip any they decline and continue to the next.

   - **Plugin behind**: use `AskUserQuestion` to update; if yes, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/update.js" plugin` and remind the user to restart Claude Code so the new plugin loads.
   - **SDK out of date** (`updateAvailable: true`, `renameFrom` null), name the workspace and the `current → latest` jump, then use `AskUserQuestion` to upgrade; if yes, run the package manager's upgrade from that workspace directory (the same commands `/bitfab:update` uses): npm / pnpm / yarn / bun `add @bitfab/sdk@latest`; uv / poetry / pip `bitfab-py@latest`; `bundle update bitfab`; `go get github.com/Project-White-Rabbit/bitfab-go@latest && go mod tidy`. Read the manifest afterward to confirm the new version. Each workspace is its own decision.
   - **On the legacy `bitfab` package** (`renameFrom` non-null), this rewrites import sites, so **preview before touching code**: list every `from "bitfab"` / `require("bitfab")` site you would change, then use `AskUserQuestion` to proceed. If yes, remove the old package and add the new one in one step (e.g. `pnpm remove bitfab && pnpm add @bitfab/sdk@latest`, or the npm / yarn / bun equivalent) and rewrite those imports to `@bitfab/sdk`. Do this even when `current` already equals `latest`, the rename is the fix. (TypeScript-only; Python / Ruby / Go package names don't change.)
   - **Replay missing or incomplete**: use `AskUserQuestion` to refresh; if yes, run `/bitfab:setup replay` to create or extend the scripts so every trace function key is covered (it is non-interactive).

   For unusual monorepos or private registries, defer to `/bitfab:update`. Report what was applied and what the user declined. Do not open Studio.

   **Next:**

   - Mode `inspect`: invoke the `setup-cleanup` skill with mode `inspect`.
