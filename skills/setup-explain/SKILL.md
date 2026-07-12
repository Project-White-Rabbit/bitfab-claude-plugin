---
name: setup-explain
description: Explain phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
---

# Bitfab Setup: Explain

**Run only when mode is `explain`.**

Explain what Bitfab is and how this skill is organized. Read-only, no authentication, no code changes, no Studio. Triggered explicitly by `/bitfab:setup explain` (or natural-language asks like "what is Bitfab" / "explain Bitfab").

1. Render the overview below **verbatim** as a single message, then stop. Do **not** authenticate, scan the codebase, use AskUserQuestion, or take any further action, `explain` is purely informational.

   ```
   Bitfab captures what your AI code does, turns runs into reusable datasets, and verifies fixes by replaying them against real data.

   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │   CODE   │───▶│  TRACES  │───▶│ DATASETS │───▶│ IMPROVE  │
   │          │    │ (what it │    │(reusable │    │ (edit +  │
   │          │    │   did)   │    │test set) │    │ verify)  │
   └──────────┘    └──────────┘    └──────────┘    └──────────┘

   Primitives
     • Trace  , a recording of one workflow run (inputs, outputs, every step inside).
                 Ground truth for what your code actually did.
     • Dataset, a curated collection of traces (failures, a specific workflow, custom).
                 The reusable test set your changes get measured against.
     • Replay , a tool that re-runs a dataset through your current code.
                 Turns production data into a ready-made regression test.

   What you can run
     /bitfab:setup            Login, then instrument workflows until done
     /bitfab:setup explain    This overview (read-only)
     /bitfab:setup login      Authenticate with Bitfab
     /bitfab:setup instrument Wrap a new AI workflow with tracing
     /bitfab:setup modify     Adjust what an existing trace captures
     /bitfab:setup inspect    Diagnose + fix setup: auth, what's instrumented, SDK/plugin current, replay coverage, traces arriving
     /bitfab:setup switch-org Switch which org the plugin reads and writes
     /bitfab:setup view       Open one trace function's plan in the browser (read-only)
     /bitfab:setup replay     Create or update replay scripts
     /bitfab:setup templates  Change how a trace function's spans render
     /bitfab:setup session-logs  Opt in/out of session log collection
   ```

   Then close with one line: to start tracing, run `/bitfab:setup`; to debug an existing setup, run `/bitfab:setup inspect`.

   **Next:**

   - Mode `explain`: invoke the `setup-cleanup` skill with mode `explain`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
