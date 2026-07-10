---
name: setup-preamble
description: Preamble phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
---

# Bitfab Setup: Preamble

**Run only when mode is `wizard`.**

1. Render the block below **verbatim** as a single message, then continue straight to Login. Do **not** ask for confirmation, do **not** use AskUserQuestion, do **not** summarize in your own words.

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

   Setup runs in two phases:
     1. LOGIN                , authenticate (15s, browser)
     2. INSTRUMENT + REPLAY  , written together per workflow:
        • INSTRUMENT         , wrap your workflows with tracing (purely additive)
        • REPLAY             , generate a replay script for your trace functions
   ```

   Then proceed to Login.

   **Next:**

   - Mode `wizard`: invoke the `setup-login` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
