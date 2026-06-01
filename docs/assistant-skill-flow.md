# `/bitfab:assistant` Skill Flow

Visual reference for the six phases of the Bitfab assistant skill (`commands/assistant.md`).
Edit the Mermaid block below to keep this in sync with the skill.

## Entry modes

The skill has six entry modes. `wizard` walks every phase; the five sub-modes do one focused thing each. `dataset` and `experiment` require the trace function key as the argument because they skip the function picker; `investigate` does its own function lookup, so the key is optional; `benchmark` enters at Phase 5's replay step and stops at a scorecard; `add-trace` resolves the function key from the trace itself when it isn't supplied and attaches the trace(s) to a dataset. Studio opens for every mode except `benchmark` and `add-trace`.

| Invocation | Enters at | Stops after |
|---|---|---|
| `/bitfab:assistant` or `/bitfab:assistant wizard` | Phase 1 | Phase 6 |
| `/bitfab:assistant investigate [<key>]` | Phase Investigate | Phase Investigate (chat summary or analysis report), or Phase 6 (if the user picks "Build a dataset", continues through experiments) |
| `/bitfab:assistant dataset <key>` | Phase 3 | Phase 6 (continues through diagnose + experiments after dataset is built) |
| `/bitfab:assistant experiment <key>` | Phase 5 (rehydrate step) | Phase 6 |
| `/bitfab:assistant add-trace <key> <trace-id...> [<dataset-id>]` | Phase Add | Phase Add (attach raw to dataset; no Studio, diagnose, or experiments) |

In `dataset` mode, Phase 1 (function picker) and Phase 2 (instrumentation/replay verification) are skipped — the agent greps the codebase for the key directly, then continues through Phase 4 (diagnose) and Phase 5 (experiments) after the dataset is built. In `experiment` mode, Phases 1-4 are skipped — Phase 5 starts with a rehydrate step that fetches the existing validated dataset and locates the code. In `investigate` mode, Phase Investigate gathers context (function key + code path), explores the issue free-form via search / read traces + code, then branches on the user's choice (stop, write report, or hand off to Phase 3 for dataset building). If the user picks dataset building, the flow continues through Phase 4 and Phase 5 (experiments) rather than stopping. In `add-trace` mode (Phase Add), the skill never greps the codebase — it resolves the trace's function key via `read_traces` when not supplied, picks or creates a dataset, attaches the trace(s) raw (no labels), and stops — it never opens Studio (no browser, no plugin CLI commands); the user labels and approves the traces later wherever they review datasets.

## Full flow

```mermaid
flowchart TD
    Start([User invokes /bitfab:assistant [mode] [traceFunctionKey]]) --> ModeCheck{Mode?}
    ModeCheck -- wizard --> ArgCheck{Arg provided?}
    ModeCheck -- investigate --> PIGather
    ModeCheck -- dataset --> P3Start
    ModeCheck -- experiment --> P5Rehydrate
    ModeCheck -- add-trace --> PAddResolve["add-trace mode:<br/>resolve trace IDs + function key<br/>(read_traces if key absent)"]
    PAddResolve --> PAddPick["Pick or create dataset<br/>list_datasets / create_dataset"]
    PAddPick --> PAddAttach["mcp: add_traces_to_dataset<br/>(raw, no labels)"]
    PAddAttach --> PAddStop([Stop: lightweight; no Studio, diagnose, or experiments])
    ArgCheck -- Yes --> P1Use[Use provided key]
    ArgCheck -- No --> P1List

    %% ============ PHASE 1 ============
    subgraph Phase1["PHASE 1 — Identify Trace Function"]
        direction TB
        P1List["mcp: list_trace_functions"] --> P1Desc["Use ONLY returned metadata (keys, counts, last activity)<br/>NEVER infer/guess descriptions from key names<br/>Cross-check each key via grep → mark ✅ instrumented here (path)<br/>or ⚠️ not found in this repo"]
        P1Desc --> P1Ask[/"AskUserQuestion:<br/>• Recommended (most recent activity)<br/>• Type a function key"/]
    end

    P1Use --> P2Inst
    P1Ask --> P2Inst

    %% ============ PHASE INVESTIGATE ============
    subgraph PhaseInvestigate["PHASE INVESTIGATE — Free-form Investigation"]
        direction TB
        PIGather["Gather context:<br/>read user's message<br/>if key passed → list_trace_functions + grep<br/>if no key → list_trace_functions,<br/>match against user's description or ask"] --> PIExplore["Explore issue (free-form):<br/>search_traces / read_traces with filters<br/>matching the user's concern<br/>read code (function + call chain + BAML)<br/>quantify if asked"]
        PIExplore --> PIPresent[/"AskUserQuestion (present findings inline first):<br/>• A — Stop here (chat summary only)<br/>• B — Write analysis report<br/>• C — Build a labeled dataset (Recommended when failures are reproducible)"/]
        PIPresent -- "A — Stop" --> CleanupClose
        PIPresent -- "B — Write report" --> PIWrite["Write .bitfab/analysis/&lt;key&gt;-&lt;ts&gt;.md<br/>(findings, hypotheses, next steps)"]
        PIWrite --> CleanupClose
    end

    PIPresent -- "C — Build dataset" --> P3Start

    %% ============ PHASE 2 ============
    subgraph Phase2["PHASE 2 — Verify Instrumentation & Replay"]
        direction TB
        P2Inst["Check instrumentation:<br/>grep codebase for trace function key"] --> P2InstFound{Key found<br/>in code?}
        P2InstFound -- Yes --> P2NoteLoc["Note file location<br/>(used in Phases 3 & 4)"]
        P2InstFound -- No --> P2InstAsk[/"AskUserQuestion:<br/>• Instrument now (Recommended)<br/>• Continue anyway<br/>• Pick different function<br/>• Stop"/]
        P2InstAsk -- "Instrument now" --> P2InvokeSetup["Skill: /bitfab:setup instrument"]
        P2InvokeSetup --> P2NoteLoc
        P2InstAsk -- "Continue anyway" --> P3Start
        P2InstAsk -- "Pick different" --> P1List
        P2InstAsk -- "Stop" --> CleanupClose

        P2NoteLoc --> P2Replay["Check replay script:<br/>scripts/replay.* + SDK replay imports"]
        P2Replay --> P2RepFound{Script covers<br/>this key?}
        P2RepFound -- Yes --> P2DetectCaps
        P2RepFound -- No --> P2RepAsk[/"AskUserQuestion:<br/>• Create replay now (Recommended)<br/>• Pick different function<br/>• Stop"/]
        P2RepAsk -- "Create replay" --> P2InvokeReplay["Skill: /bitfab:setup replay"]
        P2InvokeReplay --> P2DetectCaps
        P2RepAsk -- "Pick different" --> P1List
        P2RepAsk -- "Stop" --> CleanupClose

        P2DetectCaps["Detect replay capabilities:<br/>grep script for code-change,<br/>experiment-group-id, traceId"] --> P2CapsGate{All 3 flags<br/>present?}
        P2CapsGate -- Yes --> P3Start
        P2CapsGate -- No --> P2CapsAsk[/"AskUserQuestion:<br/>list missing capabilities<br/>• A: Upgrade replay script (Recommended)<br/>• B: Continue without"/]
        P2CapsAsk -- "A — Upgrade" --> P2Upgrade["Upgrade SDK + invoke<br/>setup replay to regenerate<br/>script, re-grep flags"]
        P2Upgrade --> P3Start
        P2CapsAsk -- "B — Continue" --> P3Start
    end

    %% ============ PHASE 3 ============
    subgraph Phase3["PHASE 3 — Build Dataset via Labeling"]
        direction TB
        P3Start["1. mcp: search_traces validated:true<br/>collect already-validated traces"] --> P3Step2["2. mcp: search_traces (no filter)<br/>+ read_traces scope:summary<br/>find diverse unlabeled candidates"]
        P3Step2 --> P3Step3[/"3. AskUserQuestion:<br/>approve / adjust / skip candidates"/]
        P3Step3 --> P3Step4["4. ★ HARD RULE ★<br/>Read code (Phase 2 file location)<br/>read_traces scope:full<br/>update_agent_labels with label + annotation<br/>BEFORE running startDataset.js"]
        P3Step4 --> P3Step5["5. node startDataset.js traceId1 traceId2 ...<br/>opens labeling UI in browser"]
        P3Step5 --> P3Step6["6. Wait for startDataset.js to exit<br/>(blocks until user finishes)"]
        P3Step6 --> P3Step7["7. read_traces scope:full<br/>on validated + newly labeled set"]
        P3Step7 --> P3Gate{"8. ★ GATE ★<br/>≥1 validated failing label?<br/>(search_traces validated:true labelResult:false)"}
        P3Gate -- No --> P3Step2
        P3Gate -- Yes --> P3Approve[/"8b. AskUserQuestion:<br/>approve dataset"/]
        P3Approve -- Reject --> P3Step2
        P3Approve -- Approve --> P3Hold["9. Hold dataset in-context<br/>(benchmark for Phase 5)"]
    end

    P3Hold --> P4Step1

    %% ============ PHASE 4 ============
    subgraph Phase4["PHASE 4 — Diagnose & Plan"]
        direction TB
        P4Step1["Step 1: Understand failures<br/>read_traces scope:full on 3-5 failed"] --> P4Step2["Step 2: Read the code<br/>instrumented fn + call chain + BAML"]
        P4Step2 --> P4Step3["Step 3: Categorize fixes into 3 buckets"]
        P4Step3 --> P4Buckets["★ Bucket 1: Code fixes — BUNDLED into ONE experiment<br/>★ Bucket 2: Judgment fixes — each its own experiment<br/>★ Bucket 3: Infra proposals — NO experiments, file as tasks"]
        P4Buckets --> P4Plan[/"AskUserQuestion:<br/>present categorized plan,<br/>get confirmation"/]
    end

    P4Plan --> P5DetectCaps

    %% ============ PHASE 5 ============
    subgraph Phase5["PHASE 5 — Iterate with Replay"]
        direction TB
        P5OpenStudio["Step 0: Open Studio<br/>openStudioTo.js (background)"] --> P5DetectCaps
        P5OpenStudio --> P5Rehydrate
        P5Rehydrate["Rehydrate (experiment mode only):<br/>grep code for key<br/>search_traces validated:true<br/>read_traces scope:full"] --> P5RehydrateGate{≥1 validated<br/>failing label?}
        P5RehydrateGate -- No --> P5CloseStudio2["Close Studio<br/>(kill background)"]
        P5CloseStudio2 --> CleanupClose
        P5RehydrateGate -- Yes --> P5DetectCaps

        P5DetectCaps["Detect replay capabilities<br/>(skip if already ran in Phase 2):<br/>grep script for code-change,<br/>experiment-group-id, traceId"] --> P5CapsGate{All 3 flags<br/>present?}
        P5CapsGate -- Yes --> P5Fork
        P5CapsGate -- No --> P5CapsAsk[/"AskUserQuestion:<br/>list missing capabilities<br/>• A: Upgrade replay script (Recommended)<br/>• B: Continue without"/]
        P5CapsAsk -- "A — Upgrade" --> P5Upgrade["Upgrade SDK + invoke<br/>setup replay to regenerate<br/>script, re-grep flags"]
        P5Upgrade --> P5Fork
        P5CapsAsk -- "B — Continue" --> P5Fork

        P5Fork["Fork independent experiments<br/>to subagents via Agent tool<br/>(isolation: worktree)"] --> P5Step1[/"Step 1: AskUserQuestion<br/>explain change, get confirmation"/]
        P5Step1 --> P5Edit["Edit iteration target<br/>(prompt, code, params, BAML)"]
        P5Edit --> P5Step2["Step 2: Replay against dataset<br/>replay script --trace-ids id1,id2,...<br/>★ capture testRunId for each replay<br/>★ classify items: completed / infraErrored / total"]
        P5Step2 --> P5HealthGate{"Step 3: Check replay health<br/>(crash? all errored? high infra rate?)"}
        P5HealthGate -- "Crash or all errored" --> P5Edit
        P5HealthGate -- "Healthy or mixed" --> P5Step3
        P5Step3["Step 4: Evaluate vs labels & annotations<br/>(only items with no item.error)<br/>fail: did fix address annotation?<br/>pass: did it regress?<br/>★ unreplayable is its own bucket"] --> P5StepView["Step 5: openStudioTo.js path<br/>navigates Studio to experiments page<br/>(non-blocking, parallel review)"]
        P5StepView --> P5Step4[/"Step 6: Share results<br/>show full table + unreplayable count,<br/>highlight best, recommend continue / replan / stop"/]
        P5Step4 --> P5Outcome{Outcome}
        P5Outcome -- "Improved + no regressions:<br/>continue iterating" --> P5Step1
        P5Outcome -- "Regressions or no improvement:<br/>new experiment plan" --> P4Step3
        P5Outcome -- "Stop iterating" --> P5CloseStudio
        P5CloseStudio["Close Studio<br/>(kill background)"] --> P6Step1
    end

    %% ============ PHASE 6 ============
    subgraph Phase6["PHASE 6 — Validate & Wrap Up"]
        direction TB
        P6Step1[/"Summary AskUserQuestion:<br/>failed traces fixed,<br/>pass rate, files changed"/] --> CleanupClose
    end

    %% ============ CLEANUP ============
    subgraph Cleanup["CLEANUP"]
        direction TB
        CleanupClose["Cleanup: close Studio<br/>(no-op if no session was opened)"] --> EndFinal([Done])
    end

    %% Styling
    classDef terminal fill:#dcfce7,stroke:#166534,color:#000
    classDef question fill:#fae8ff,stroke:#86198f,color:#000
    classDef constraint fill:#fee2e2,stroke:#b91c1c,color:#000

    class EndFinal terminal
    class P1Ask,P2InstAsk,P2RepAsk,P3Step3,P3Approve,P4Plan,P5CapsAsk,P5Step1,P5Step4,PIPresent question
    class P3Step4,P3Gate,P4Buckets,P5HealthGate constraint
```

## Key invariants the diagram enforces

1. **Pre-label before UI (HARD RULE).** Phase 3 Step 4 must call `mcp: update_agent_labels` with verdicts + annotations for every approved trace **before** Step 5 runs `startDataset.js`. The user enters the labeling UI to confirm or correct Claude's verdicts, never to label from scratch. Skipping this is a process violation.

2. **Grounded labeling.** Step 4's verdicts must be grounded in the codebase, not just the trace text — Claude reads the instrumented function (located in Phase 2) and nearby intent (comments, BAML files, related tests) before deciding pass/fail. Annotations are written for the human reviewer.

3. **Validated failing label gate.** Phase 3 Step 8 requires at least one **validated** failing label (`labelSource = 'human' OR approvedAt IS NOT NULL` AND `labelResult = false`). Unapproved agent labels from Step 4 do not count. If the gate fails, loop back to Step 2 to find or label more traces.

4. **Three-bucket categorization.** Phase 4 always splits proposed fixes into:
   - **Bucket 1 (code fixes)** — bundled into ONE experiment as a foundation. Multiple deterministic fixes never become multiple experiments.
   - **Bucket 2 (judgment fixes)** — each becomes its own experiment so the user can evaluate it.
   - **Bucket 3 (infra proposals)** — never experiments. Filed as tasks (Linear/Notion/Jira) to keep experiments apples-to-apples.

5. **Independent experiments fork.** Phase 5 forks experiments that don't depend on sequential results to subagents using `Agent` tool with `isolation: "worktree"`. Sequential experiments run in the main agent.

6. **Dataset is the benchmark, annotations are the acceptance criteria.** Every Phase 5 evaluation reads the dataset's labels and annotations from Phase 3. The annotation explains *what went wrong* and is used directly as the pass/fail criterion for the new output.

7. **Re-entry to Phase 1.** Both AskUserQuestions in Phase 2 ("Pick different function") loop back to `P1List` — the user can swap targets without restarting the skill.

8. **Replan loop from Phase 5 → Phase 4.** If experiments improved nothing or introduced regressions, the loop returns to Phase 4 Step 3 (re-categorize) rather than Phase 5 Step 1 (re-run the same experiment).

9. **Sub-mode continuation.** `dataset` enters at Phase 3, builds the labeled dataset, then continues through Phase 4 (diagnose) and Phase 5 (experiments) to Phase 6. `experiment` enters at Phase 5's rehydrate step (which fetches the existing validated dataset and locates the code), then runs the iterate-with-replay loop through Phase 6 — no Phase 4 categorization runs. If `experiment` finds no validated failing labels, it stops and recommends running `/bitfab:assistant dataset <key>` first. `investigate` enters at Phase Investigate, does its own function lookup + code grep, then branches on the user's choice: stop with a chat summary, write a markdown analysis report to `.bitfab/analysis/`, or hand off to Phase 3 to build a labeled dataset (which then continues through Phase 4 and Phase 5 to Phase 6). `dataset` and `experiment` require the trace function key as an argument because Phase 1 is skipped; `investigate` makes the key optional and figures out the function from what the user described when it isn't passed.

10. **Studio lifecycle and universal cleanup.** Phase 5 opens Studio at the start (`openStudioTo.js`, background) and kills the background process at the end. Additionally, every terminal exit in the flow routes through the `cleanup/close-studio` step, which closes the Studio browser tab via `closeStudio.js <sessionId>` if a session was opened, or is a no-op if not. This is enforced structurally by the flow (every `next: null` points to `cleanup/close-studio`), not by a behavioral instruction. The experiment viewer in Step 4 uses `openStudioTo.js` to navigate the existing Studio or open a new one. The agent's textual summary in Step 5 is still required and is not optional.

11. **No hallucinated function descriptions in Phase 1.** The list shown to the user uses only data returned by `list_trace_functions` (keys, trace counts, last activity). Claude never invents a description from the key name — key names are often ambiguous or misleading and guessed descriptions confuse the user. Each returned key is additionally cross-checked against the local codebase via `grep`, and each entry is marked ✅ instrumented here (with path) or ⚠️ not found in this repo so the user can see ground truth before picking.

12. **Replay-health gate before evaluation (HARD RULE).** Phase 5 Step 3 (`check-replay-health`) runs between replay execution and evaluation. Items where `item.error` is set are unreplayable (infra failure: stale DB row, FK violation, rejected write, env mismatch) — NOT failing outputs. A whole-replay crash or an all-errored run loops back to fix the replay script; healthy/mixed runs carry the `infraErrored` count forward as its own bucket. Pass/fail is computed only over items with no `item.error`, and the unreplayable count is never folded into the pass-rate denominator.

13. **Replay capability detection runs in both Phase 2 and Phase 5.** Phase 2's `detect-replay-capabilities` step greps the replay script for three flags (`code-change`, `experiment-group-id`, `traceId`) right after confirming the replay script exists. Phase 5 has the same step, which skips if Phase 2 already ran it. This dual placement means `experiment` mode (which skips Phase 2) still gets capability detection before the first experiment, while `wizard`/`dataset`/`investigate` modes get it early during instrumentation verification. If any flags are missing, the user chooses to upgrade (SDK update + `setup replay` regeneration) or continue without. The iteration loop (`share-results` back to `make-change`) skips this step on subsequent iterations because capabilities don't change mid-session.

14. **Reactive trace-plan opening, not a flow phase.** Opening a trace plan is a cross-cutting capability of this skill, not a primitive (`/bitfab:plan` was removed). Trigger only when the user asks ("show me what's captured," "open the plan for X") or context clearly implies it. Never auto-open as part of normal phase routing, the assistant flow does not detour through plan-opening between phases. When triggered, run two sequential calls (step 2 needs the planId from step 1, so they can't be batched): `get_trace_plan({ traceFunctionKey })` returns the plan id, then `openStudioTo.js "/studio/trace-plan/<planId>"` (substituting that id). The plan renders in the open Studio tab in-place (Studio chrome stays mounted around the trace plan content via the `/studio/trace-plan/[id]` route, which re-uses the `TracePlanView` component from the canonical `/trace-plan/[id]` page). No new tab pops up. If no plan exists for the key, say so in one line and offer `/bitfab:setup modify <key>` to build one.

## Legend

| Shape | Meaning |
|---|---|
| Rectangle | Action / step |
| Diamond | Internal decision (Claude decides based on state) |
| Parallelogram | AskUserQuestion (user decides) |
| Stadium (rounded) | Terminal — flow stops |
| Red fill | Hard constraint — violating this is a bug |
| Purple fill | User interaction point |
| Green fill | Successful exit |

## CLI commands referenced

| Command | Phase | Purpose |
|---|---|---|
| `openStudioTo.js <path>` | Phase 5 (Step 0, Step 5) | Opens Studio in background or navigates existing tab to path |
| `startDataset.js <traceId...>` | Phase 3 (Step 5) | Opens labeling UI; blocks until user finishes |
| `closeStudio.js <sessionId>` | Cleanup | Closes the Studio browser tab opened during the session; no-op if no session was opened |

## How to update

When `commands/assistant.md` changes (steps added, removed, reordered, branches changed, MCP tools swapped, hard rules added/removed), update the Mermaid block above and re-render to verify. The diagram and the skill must agree — they document the same flow.

Same edits should be mirrored to `bitfab-cursor-plugin/skills/bitfab-assistant/SKILL.md` and `bitfab-codex-plugin/skills/assistant/SKILL.md` per the CLAUDE.md plugin sync rule. The codex skill carries platform-specific extras (`BITFAB_PLUGIN_DIR` resolution, Blocking-process polling rule) that stay codex-only.
