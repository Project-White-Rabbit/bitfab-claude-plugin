---
description: Set up and maintain Bitfab tracing for AI features. TRIGGER when: user wants to set up Bitfab, instrument code, add tracing/observability for LLM or agent calls, observe AI calls, add evaluation, trace LLM functions, trace a new workflow, change what an existing trace captures, re-instrument an existing traced function (move a database read or other side effect in or out of a span, change what a span records as its input/output), inspect or debug their tracing setup (what's instrumented, why traces aren't showing up), or understand what Bitfab is; or says anything like 'instrument', 'add tracing', 'trace my code', 'set up observability', 'hook up Bitfab', 'start tracking my AI workflow', 'trace a new workflow', 'update my tracing setup', 're-instrument', 're-instrument <function>', 'move the database read out of the span', 'make this trace replayable without a database', 'change what this span records as input', 'why aren't my traces showing up', 'what is Bitfab', 'set up database snapshots', 'replay against my database state at trace time', 'analyze the repo for what to instrument', 'analyze-repo', 'instrument the second/next/other one', 'instrument another function'. This trigger applies even mid-conversation and after setup already ran: every additional function to instrument must re-enter this skill. SKIP when: user is (a) improving the QUALITY of a traced function's outputs, fixing failures, pass rates, labeling, running experiments (use bitfab:assistant); or (b) upgrading the plugin/SDK to a newer *version* (use bitfab:update)
argument-hint: "[wizard|explain|login|session-logs|instrument|modify|inspect|switch-org|replay|db-snapshot|templates|analyze-repo] [<what to do>]"
---

# Bitfab Setup

**Always use `AskUserQuestion` when asking questions or presenting choices** (one exception: a step that explicitly says its answer is free-form, such as asking which file or function to instrument once the user has said they know, asks in plain chat and waits, because a menu there would stand between the user and the answer only they hold). Never print a question as text and wait. Rules:
- Recommend an option first, explain why in one line
- Present 2-5 concrete options
- One decision per question, never batch

**Execution style (applies to every phase).** Default to terse, action-first turns:
- During mechanical phases (detecting language, searching code, reading files), run the tools and report only what you found. Do not narrate each command or pre-announce what you are about to do.
- Batch read-only probing: combine related shell checks into one command (separate them with `;`, not `&&` (a no-match `grep` exits non-zero and would abort an `&&` chain, skipping later probes)), and read multiple files in a single batch rather than one file per turn. Adaptive follow-up greps that depend on a prior result are expected and fine; the goal is to collapse only the fixed, independent probes.
- Keep prose between tool calls to one line or none. Save fuller explanation for decision points and the workflow summaries the user acts on.
- Surfacing a risk, ambiguity, or unexpected finding is never the narration to suppress: raise it immediately, even mid-probe (e.g. unserializable inputs, a shim with lazy init, an ambiguous project root).

This skill has eleven phases: **explain**, **login**, **session-logs**, **instrument**, **modify**, **inspect**, **switch-org**, **replay**, **db-snapshot**, **templates**, and **analyze-repo**. Run individually or through setup (`wizard` runs login → instrument; `explain` is a standalone read-only overview that requires no login; `session-logs` is standalone and does not require login; `modify` is only invoked explicitly or as a branch from Instrument's existing-SDK-usage menu; `inspect` is a standalone diagnostic (with optional one-shot fixes) invoked explicitly; `switch-org` is a standalone account action (requires auth) invoked explicitly; `db-snapshot` is only invoked explicitly; `templates` is only invoked explicitly; `analyze-repo` is a standalone, **non-interactive** batch action (requires auth) invoked explicitly: it scans, picks the top few candidates, and reports source locations and replay dependencies, asking nothing and editing no code).

**Natural-language aliases:** "explain Bitfab" → `explain`; "trace a new workflow" / "instrument another function" → `instrument`; "adjust what is captured" / "re-instrument" → `modify`; "why are my traces missing" → `inspect`; "switch org" → `switch-org`; "set up database snapshots" → `db-snapshot`; "analyze the repo" → `analyze-repo` (read-only source recommendations).

When instrumenting a workflow, **its instrumentation and replay pipeline are written together in the same cycle** after the workflow is selected (see Instrument's write-instrumentation step). The standalone `replay` mode remains available for coverage-verification and backfill.

**SDK reference:** https://docs.bitfab.ai is the source of truth for SDK install, initialization, API surface, and replay. Every docs path below ends in `.md`: that suffix returns the page as plain markdown (no HTML chrome), so fetch the URLs exactly as written. Fetch in this order before writing any code, do not improvise from memory:
- **Canonical API surface (preferred for agents):** the dense reference pages at `/reference/typescript.md`, `/reference/python.md`, `/reference/ruby.md`, `/reference/go.md`. These list every public export, signature, type, default, and error semantic, no tutorials, no prose. Read these first.
- **Default to opt-out tracing.** For TypeScript, install and wire the matching `@bitfab/transform` build adapter, then use `withTrace`/`trace` for the workflow root and `withNode`/`node` only where a discovered call needs naming, typing, capture, finalization, or replay-mocking policy. For Python 3.12+, use `@client.trace` and `@client.node` the same way. Opt-in `withSpan`/`span` remains supported, but setup chooses it only when opt-out is technically impossible: Ruby, Go, Python before 3.12, a TypeScript build path for which the documented transform adapters truly cannot be wired, or a live streaming root whose output opt-out tracing cannot finalize without changing behavior. Framework handlers, processors, and their generated spans are compatible descendants of an opt-out root and are never by themselves a reason to choose spans. Keep the framework integration and use `withNode`/`node` for first-party calls that need explicit policy. Existing manual spans in the selected call stack are also not a reason to fall back. Convert that whole call stack to one opt-out surface. Before converting a span-bearing helper in place, inspect every production caller and confirm each caller belongs to the same opt-out surface; a helper shared with an opt-in caller requires a disjoint trace boundary or explicit refactor confirmation. Remove redundant span wrappers and replace policy-bearing spans with nodes. Preserve their names, types, capture controls, finalizers, and replay-mocking behavior. TypeScript `withNode` requires a named function, so preserve an existing name or use an additive named function form; stop for refactor confirmation if naming it would require a non-additive rewrite. Never put `withSpan` beneath `withTrace`. The SDK raises `MixedTracingError`. Name all three primitives when fetching a reference page so the fetched guidance cannot collapse back to spans alone.
- **Cross-SDK shared semantics:** `/reference/overview.md` (invariants), `/reference/span-types.md` (the `SpanType` enum), `/reference/http.md` (wire protocol).
- **Framework integrations (fetch when a framework is detected in step 1 of Instrument):** `/frameworks/langgraph.md`, `/frameworks/openai-agents.md`, `/frameworks/claude-agent-sdk.md`, `/frameworks/baml.md`, `/frameworks/vercel-ai-sdk.md`. Each page documents the SDK's native handler/processor/wrapper for that framework, which is usually preferable to hand-wrapping every node/agent call with `withSpan`/`@span`.
- **Tutorials / walkthroughs / replay registry module template:** the language-specific documentation pages (`/typescript-sdk.md`, `/python-sdk.md`, `/ruby-sdk.md`, `/go-sdk.md`). Use these for the copy-pasteable replay registry module and the replay output contract. During Instrument, fetch the Replay section before Instrument's write-instrumentation step so the replay registry module can be written alongside the instrumentation in the same cycle without re-fetching.

**MCP tools:** Use the plugin tools for authentication, trace functions, trace search, organizations, database connection status, and templates as specified by each step.


**Product pages:** Link to the existing app pages for experiments, datasets, and other dashboard features. Use /plugin only for automatic-close login and template previews. Page commands print one JSON line with `event: "link"` and `url`, then exit. Relay the URL in chat. The user reports review decisions in chat; fetch current saved state with MCP before continuing. Never treat printing a link or closing a browser tab as approval.

**CLI commands** available via Bash (all paths relative to `${CLAUDE_PLUGIN_ROOT}/dist/commands/`):

| Command | Description |
|---------|-------------|
| `pageLink.js <path>` | Print a clickable product page URL and exit. |
| `openExperiments.js <testRunIds>` | Print a link to experiments. |
| `startDataset.js <key> <datasetId>` | Print a dataset link. |
| `status.js` | Check plugin authentication and connection status |
| `login.js` | Open a sign-in window and wait for authentication. Relay the printed sign-in link as a fallback. |
| `switchOrg.js [<clerkOrganizationId>]` | List the user's Bitfab orgs (no args), or switch the plugin's active org and replace the local API key (with a <clerkOrganizationId> arg) |
| `startTemplatePreview.js <functionKey>` | Print a template preview link and exit. |
| `update.js <mode>` | Check plugin + SDK versions and install the latest (used by inspect to detect and fix staleness) |
| `sessionLogConsent.js [get|set true|set false]` | Read (`get` prints `true`/`false`/`null`) or persist (`set true|false`) the global session-log consent flag |

## Modes

Read `$ARGUMENTS` first. If its first token is exactly one of the mode names below, run that mode. Otherwise, when this skill documents how to route the remaining arguments (see its intro), follow that; if it doesn't, run `wizard` and treat `$ARGUMENTS` as its input. Follow only the selected mode's path below.

| Mode | Trigger | What it does |
|------|---------|--------------|
| `wizard` | `wizard` (default) | Run login, then instrument workflows until the user is done. |
| `explain` | `explain` | Explain what Bitfab is and what each mode does (read-only, no login). |
| `login` | `login` | Authenticate for setup and instrumentation. |
| `session-logs` | `session-logs` | Opt in or out of session log collection (no login required). |
| `instrument` | `instrument` | Instrument AI workflows with Bitfab tracing. |
| `modify` | `modify` | Modify an existing trace setup (add context, change depth, or move the root). |
| `inspect` | `inspect` | Diagnose (and offer to fix) your tracing setup: auth, what's instrumented, plugin/SDK freshness, replay coverage, trace arrival. |
| `switch-org` | `switch-org` | Switch which Bitfab org the plugin reads and writes (replaces the local API key). |
| `replay` | `replay` | Create or update replay registry modules for instrumented workflows. |
| `db-snapshot` | `db-snapshot` | Set up per-trace database snapshots so replay runs against the DB state at trace time (TypeScript, Python, Ruby). |
| `templates` | `templates` | Iterate on the span-rendering templates for one trace function. |
| `analyze-repo` | `analyze-repo` | Read-only discovery: scan source, rank the top workflows to instrument, and report recommendations without creating artifacts or changing code. |

## Dispatch

- Mode `wizard` or `login` or `instrument`: invoke the `setup-login` skill with the current mode (`wizard` or `login` or `instrument`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `explain`: invoke the `setup-explain` skill with mode `explain`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `session-logs`: invoke the `setup-session-logs` skill with mode `session-logs`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `modify`: invoke the `setup-modify` skill with mode `modify`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `inspect`: invoke the `setup-inspect` skill with mode `inspect`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `switch-org`: invoke the `setup-switch-org` skill with mode `switch-org`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `replay`: invoke the `setup-replay` skill with mode `replay`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `db-snapshot`: invoke the `setup-db-snapshot` skill with mode `db-snapshot`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `templates`: invoke the `setup-templates` skill with mode `templates`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
- Mode `analyze-repo`: invoke the `setup-analyze-repo` skill with mode `analyze-repo`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).

## Reference

### Instrumentation requirements

Read function signatures and bodies before instrumenting. Instrument the real production path. Keep additions behavior-preserving; preserve call order, argument and return types, error handling, streaming, and time-to-first-token. Use framework-native handlers/processors where documented. Keep one trace function key per coherent workflow, and implement its replay callable during the same cycle. Mock external reads and unsafe side effects using the SDK replay controls; keep model calls live. For non-additive refactors, follow the refactor-confirmation appendix. No persisted planning document or extra approval is required for authorized additive instrumentation.
