---
name: assistant-benchmark
description: Phase Benchmark: Scorecard phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Skill"]
---

# Bitfab Assistant: Phase Benchmark: Scorecard

**Run only when mode is `benchmark`.**

1. **Studio activity:** If `studioMode` is true, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/pushActivity.js" completed "Done"`.

   **Benchmark scorecard.** Present the results of replaying the dataset against the current code (no changes were made). Print the scorecard as Markdown directly in chat (do NOT use `AskUserQuestion`, this is a terminal report with no decision to make, and tables don't render inside the question UI). Use two tables.

   **Table 1, Summary** (one row per metric):

   ```markdown
   **Benchmark results for** `<traceFunctionKey>` · dataset `<datasetName>`

   | Metric | Count |
   |---|---|
   | Pass rate | X/scorable (Z%) |
   | Still passing | K |
   | Still failing | M |
   | Regressions | N |
   | Fixed | F |
   | Unreplayable | U (excluded) |
   | Skipped | S (excluded) |
   ```

   **Table 2, Per-trace breakdown** (one row per dataset trace). Sort rows by verdict in this order: regressions first, then still-failing, then fixed, then still-passing, then unreplayable, then skipped last:

   ```markdown
   | Trace | Label | Verdict | Detail |
   |---|---|---|---|
   | `ghi789` | pass | ❌ regression | was passing, replay now fails: [why] |
   | `jkl012` | fail | ❌ still failing | annotation said [X], output still [Y] |
   | `def456` | fail | ✅ fixed | replay now addresses: [annotation] |
   | `abc123` | pass | ✅ still passing | output preserved |
   | `mno345` | n/a | ⚠️ unreplayable | [error reason] |
   | `pqr678` | fail | ⏭️ skipped | output genuinely ambiguous; not verdicted |
   ```

   Use ✅ for pass-verdict rows (fixed, still-passing), ❌ for fail-verdict rows (regression, still-failing), ⚠️ for unreplayable, and ⏭️ for skipped (an item you explicitly marked `skip: true` in `evaluate-results` because the output was genuinely ambiguous). Keep `Detail` to one short line per row (truncate long annotations/outputs). Keep **both `unreplayable` and `skipped` out of the pass-rate denominator.** Define the counts explicitly: `T` = total traces in the dataset; `U` = unreplayable; `S` = skipped; `scorable` = `T − U − S` (the items that got a real pass/fail verdict); `X` = the count that passed (✅ fixed + ✅ still-passing). `Pass rate` = `X / scorable` (so the summary table's "X/scorable" uses these exact numbers). **If `scorable` is 0** (every trace was unreplayable or skipped, so nothing got a real verdict), report `Pass rate` as `N/A (0 scorable)` instead of `0/0`, and add a line that no trace could be scored this run. If `U > 0`, add one line under the tables naming the cause (missing DB rows, FK violation, env mismatch). Omit the `Skipped` summary row and any skipped table rows entirely when `S` is 0.

   **If running in text-only mode** (trace IDs were unavailable): append a one-line note under the tables that persistent results require upgrading to `@bitfab/sdk` 0.13.5+.

   **When `costRun` is set, add token cost to both tables.** In Table 1, add `Input tokens | base → new (±X%)` and `Output tokens | base → new (±Y%)` rows (total tokens only if the replay output does not split them). In Table 2, add a `Tokens` column showing each trace's `original → replay` total and % change. For a cost benchmark the headline is the token delta, not the pass rate alone: report both. Baseline tokens come from each original trace's recorded usage. For originals that errored, failed, or recorded no usage, apply the same cheapest-first recovery as the evaluate step (reuse a clean recorded run, else a one-off per-item backfill replay of the unchanged code), never a dataset-wide baseline arm; new tokens come from the replay output. Where no baseline could be recovered, show the cell as "no baseline" rather than a fabricated delta. Use the run's basis (`costBasis`), matching the page lens: on `uncached`, the Input row and the Tokens column are the uncached figures (`(input - cached) + output`, `input - cached` for the input row) and the table labels the row/column "uncached"; on `all`, raw `input + output`. Don't mix bases within a scorecard.

   This is a terminal step. Report the scorecard and stop. Do not offer to iterate or make changes (the user can run `/bitfab:assistant experiment <key>` separately if they want to fix failures).

   **Next:**

   - Mode `benchmark`: invoke the `assistant-cleanup` skill with mode `benchmark`.
