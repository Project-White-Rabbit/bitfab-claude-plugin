---
description: Set up and maintain Bitfab tracing for AI features. TRIGGER when: user wants to set up Bitfab, instrument code, add tracing/observability for LLM or agent calls, observe AI calls, add evaluation, trace LLM functions, trace a new workflow, change what an existing trace captures, inspect or debug their tracing setup (what's instrumented, why traces aren't showing up), or understand what Bitfab is; or says anything like 'instrument', 'add tracing', 'trace my code', 'set up observability', 'hook up Bitfab', 'start tracking', 'trace a new workflow', 'update my tracing setup', 'why aren't my traces showing up', 'what is Bitfab', 'set up database snapshots', 'replay against my database state at trace time'. SKIP when: user is (a) improving the QUALITY of a traced function's outputs, fixing failures, pass rates, labeling, running experiments (use bitfab:assistant); or (b) upgrading the plugin/SDK to a newer *version* (use bitfab:update).
argument-hint: "[wizard|explain|login|instrument|modify|inspect|switch-org|view|replay|db-snapshot|session-logs|templates] [<what to do>]"
---

# Bitfab Setup

**Always use `AskUserQuestion` when asking questions or presenting choices.** Never print a question as text and wait. Rules:
- Recommend an option first, explain why in one line
- Present 2-5 concrete options
- One decision per question, never batch

**Studio gate recovery (applies to every Studio-opening command).** Any command that opens or navigates Studio (`openTracePlan.js`, `startTemplatePreview.js`, etc.) emits `{"event":"not-responding","sessionId":"..."}` and exits non-zero when a Studio session is recorded but its window can't be reached (a crash, sleep, or a close no process witnessed). It will NOT open a duplicate window. **This is a gate, not a failure to retry blindly.** Recommend the user refresh or reopen the Studio tab, then use `AskUserQuestion` with two options: **Try again** (re-run the same command, the record is still on disk, so a window that came back gets reused) or **Open a new Studio** (run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/clearStudioSession.js"` to drop the stale pointer, then re-run the command, which now opens a fresh window). Only clear the pointer after the user approves.

This skill has eleven phases: **explain**, **login**, **session-logs**, **instrument**, **modify**, **inspect**, **switch-org**, **view**, **replay**, **db-snapshot**, and **templates**. Run individually or all at once (`wizard` runs login → instrument → replay; `explain` is a standalone read-only overview that requires no login; `session-logs` is standalone and does not require login; `modify` is only invoked explicitly or as a branch from Instrument's existing-SDK-usage menu; `inspect` is a standalone diagnostic (with optional one-shot fixes) invoked explicitly; `switch-org` is a standalone account action (requires auth) invoked explicitly; `view` is only invoked explicitly; `db-snapshot` is only invoked explicitly; `templates` is only invoked explicitly).

**Natural-language aliases (these reuse an existing mode, not a separate one):** "explain Bitfab" / "what is Bitfab" → `explain`; "trace a new workflow" / "instrument a new flow" → `instrument`; "update-setup" / "update my tracing setup" / "adjust what's captured" → `modify` (NOT a plugin/SDK *version* bump, that's `/bitfab:update`); "debug-setup" / "debug my tracing setup" / "inspect my tracing" / "why aren't my traces showing up" / "what's instrumented" → `inspect` (for output-*quality* debugging use `/bitfab:assistant` instead); "switch org" / "change org" / "switch to the <name> org" / "I'm in the wrong org" → `switch-org`; "set up db snapshots" / "set up db branching" / "replay against my database" / "replay against the database at trace time" / "database snapshots for replay" → `db-snapshot`.

Within an Instrument cycle, **instrumentation and the replay pipeline for the cycle's trace function are written together in the same cycle** once the trace plan is confirmed (see Instrument's write-instrumentation step). The Replay phase in `wizard` mode is therefore a coverage-verification/backfill sweep, it typically finds every key already wired up.

**SDK reference:** https://docs.bitfab.ai is the source of truth for SDK install, initialization, API surface, and replay. Fetch in this order before writing any code, do not improvise from memory:
- **Canonical API surface (preferred for agents):** the dense reference pages at `/reference/typescript`, `/reference/python`, `/reference/ruby`, `/reference/go`. These list every public export, signature, type, default, and error semantic, no tutorials, no prose. Read these first.
- **Cross-SDK shared semantics:** `/reference/overview` (invariants), `/reference/span-types` (the `SpanType` enum), `/reference/http` (wire protocol).
- **Framework integrations (fetch when a framework is detected in step 1 of Instrument):** `/frameworks/langgraph`, `/frameworks/openai-agents`, `/frameworks/claude-agent-sdk`, `/frameworks/baml`. Each page documents the SDK's native handler/processor/wrapper for that framework, which is usually preferable to hand-wrapping every node/agent call with `withSpan`/`@span`.
- **Tutorials / walkthroughs / replay script template:** the language-specific guide pages (`/typescript-sdk`, `/python-sdk`, `/ruby-sdk`, `/go-sdk`). Use these for the copy-pasteable replay script and the replay output contract. During Instrument, fetch the `#replay` section before Instrument's write-instrumentation step so the replay script can be written alongside the instrumentation in the same cycle without re-fetching.

**MCP tools:** This skill uses `get_bitfab_api_key`, `create_trace_plan`, and `get_trace_plan` (login / instrument / modify / view), `list_trace_functions` and `search_traces` (`inspect` and `templates`), `list_organizations` (`switch-org`), `get_database_connection_status` (`db-snapshot` only), and, for the `templates` mode only, `get_template_reference`, `get_template`, and `update_template`. All come from the **local plugin MCP server** (bundled with this plugin). Do NOT use the remote Bitfab MCP tools (`mcp__Simforge__*` or `mcp__Bitfab__*`), use only the `mcp__plugin_bitfab_Bitfab__*` variants.

| Invocation | Action |
|---|---|
| `/bitfab:setup` or `/bitfab:setup wizard` | Run login, then instrument + replay (together per workflow) |
| `/bitfab:setup explain` | Explain what Bitfab is and what each mode does (read-only, no login) |
| `/bitfab:setup login` | Authenticate for setup/instrumentation (Studio/assistant flows log in inline, no pre-login) |
| `/bitfab:setup instrument` | Instrument AI workflows with Bitfab tracing |
| `/bitfab:setup modify` | Modify an existing trace setup (add context, change depth, or move the root) |
| `/bitfab:setup inspect` | Diagnose (and offer to fix) your tracing setup: auth, what's instrumented, plugin/SDK freshness, replay coverage, trace arrival |
| `/bitfab:setup switch-org` | Switch which Bitfab org the plugin reads and writes (replaces the local API key) |
| `/bitfab:setup view` | Open the trace planner UI for an existing trace function (read-only) |
| `/bitfab:setup replay` | Create or update replay scripts for instrumented workflows |
| `/bitfab:setup db-snapshot` | Set up per-trace database snapshots so replay runs against the DB state at trace time (TypeScript, Python, Ruby) |
| `/bitfab:setup session-logs` | Opt in or out of session log collection (no login required) |
| `/bitfab:setup templates [<key>]` | Iterate on the span-rendering templates for one trace function |

**CLI commands** available via Bash (all paths relative to `${CLAUDE_PLUGIN_ROOT}/dist/commands/`):

| Command | Description |
|---------|-------------|
| `status.js` | Check plugin authentication and connection status |
| `login.js` | Authenticate for setup/instrumentation; standalone browser OAuth (blocks). Studio, dataset, and experiment flows log in inline and need no pre-login. |
| `switchOrg.js [<clerkOrganizationId>]` | List the user's Bitfab orgs (no args), or switch the plugin's active org and replace the local API key (with a <clerkOrganizationId> arg) |
| `openTracePlan.js <planId>` | Open the trace plan confirmation UI in Studio (blocks until user confirms or cancels) |
| `waitForTrace.js <trace-function-key>` | Poll for the first trace to arrive (blocks up to ~10 min) |
| `startTemplatePreview.js <functionKey>` | Open the template editor preview in Studio (blocks until user clicks Done) |
| `closeStudio.js [message]` | Close the active Studio session (tab + background event process); no-op when nothing is open |
| `clearStudioSession.js` | Clear the stale active-Studio pointer so the next open starts fresh |
| `update.js <mode>` | Check plugin + SDK versions and install the latest (used by inspect to detect and fix staleness) |
| `sessionLogConsent.js [get|set true|set false]` | Read (`get` prints `true`/`false`/`null`) or persist (`set true|false`) the global session-log consent flag |

## Dispatch

- Mode `wizard`: invoke the `setup-preamble` skill with mode `wizard`.
- Mode `explain`: invoke the `setup-explain` skill with mode `explain`.
- Mode `login`: invoke the `setup-login` skill with mode `login`.
- Mode `session-logs`: invoke the `setup-session-logs` skill with mode `session-logs`.
- Mode `instrument`: invoke the `setup-instrument` skill with mode `instrument`.
- Mode `modify`: invoke the `setup-modify` skill with mode `modify`.
- Mode `inspect`: invoke the `setup-inspect` skill with mode `inspect`.
- Mode `switch-org`: invoke the `setup-switch-org` skill with mode `switch-org`.
- Mode `view`: invoke the `setup-view` skill with mode `view`.
- Mode `replay`: invoke the `setup-replay` skill with mode `replay`.
- Mode `db-snapshot`: invoke the `setup-db-snapshot` skill with mode `db-snapshot`.
- Mode `templates`: invoke the `setup-templates` skill with mode `templates`.
