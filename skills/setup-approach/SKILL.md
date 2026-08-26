---
name: setup-approach
description: Approach phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["AskUserQuestion", "Skill"]
---

# Bitfab Setup: Approach

**Run only when mode is `wizard`.**

Settle who does the instrumenting before any code is read or written. Runs once, in `wizard` mode only, after Login.

1. The user is authenticated now. Use `AskUserQuestion` to settle who does the instrumenting:
   - **Question:** "Want me to walk you through instrumenting, or would you rather do it yourself?"

   > A) **Walk me through it**: I drive the instrumentation end to end, checking with you at each decision *(recommended)* → step 2
   > B) **I'll instrument myself**: hand over the docs and stop, no scanning, no code changes → step 3

   Recommend **A** and say why in one line: it is the whole flow (SDK install, trace plan, spans, replay registry module) with a confirmation before anything is written. Ask this once; do not re-ask it later in the session.
2. The user asked to be walked through it. **Before anything else** (before dispatching to the `setup-instrument` skill, before a single probe or file read), render the content of the block below **verbatim** as formatted markdown: no code fence, no rewording, no additions.

   ```markdown
   **What's about to happen next**

   - This wizard will guide Claude Code on how to use the Bitfab plugin to analyze your repository. Claude Code will then instrument your AI features and write a `replay` script using the Bitfab SDK.
   - Whenever Claude Code needs your input, it will prompt you
   - Setup takes about 10 - 17 minutes depending on how many features you want to instrument and how complex your AI features are.
   ```

   This is the user's only warning about what the skill is about to do to their repository and how long it takes. It has to reach them between saying "walk me through it" and the next question they get asked, so nothing, not the language detection, not the existing-usage report, may come first.

   Then go to the `setup-instrument` skill and start at its first step. The guided path ends here: do **not** continue into the self-serve handoff that follows, which belongs to option B and tells you to stop.

   **Next:**

   - Mode `wizard`: invoke the `setup-instrument` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
3. The user is instrumenting on their own. Give them the pointers below in one short message, then **stop**: do not scan the codebase, read files, or edit anything.

   - **Docs:** https://docs.bitfab.ai, start with the SDK guide for their language (`/typescript-sdk`, `/python-sdk`, `/ruby-sdk`, `/go-sdk`); each one covers install, initialization, wrapping a workflow, and (outside Go) the replay registry module. Name the language's page directly if the project's language is already obvious from the conversation; do not go read the repo to find out.
   - **API key:** their app needs `BITFAB_API_KEY` set in the environment it runs in before any trace will arrive. Tell them to get the key from the Bitfab MCP's `get_bitfab_api_key` tool. Do **not** call it yourself, and never print a key.
   - **Coming back:** `/bitfab:setup` picks this flow back up, and `/bitfab:setup inspect` diagnoses an instrumentation they wrote themselves (auth, what's instrumented, whether traces are arriving).

   Then go to the `setup-cleanup` skill and end the run there. Option B is a full stop: do **not** read on into the sections that follow, the `setup-instrument` skill included, and do not scan or edit anything on the way out.

   **Next:**

   - Mode `wizard`: invoke the `setup-cleanup` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
