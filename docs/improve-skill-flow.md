# `/bitfab:improve` Skill Flow

Visual reference for the six phases of the Bitfab improve skill (`commands/improve.md`).
Edit the Mermaid block below to keep this in sync with the skill.

## Full flow

```mermaid
flowchart TD
    Start([User invokes /bitfab:improve traceFunctionKey]) --> ArgCheck{Arg provided?}
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
        P2InstAsk -- "Stop" --> EndStop1([Stop])

        P2NoteLoc --> P2Replay["Check replay script:<br/>scripts/replay.* + SDK replay imports"]
        P2Replay --> P2RepFound{Script covers<br/>this key?}
        P2RepFound -- Yes --> P3Start
        P2RepFound -- No --> P2RepAsk[/"AskUserQuestion:<br/>• Create replay now (Recommended)<br/>• Pick different function<br/>• Stop"/]
        P2RepAsk -- "Create replay" --> P2InvokeReplay["Skill: /bitfab:setup replay"]
        P2InvokeReplay --> P3Start
        P2RepAsk -- "Pick different" --> P1List
        P2RepAsk -- "Stop" --> EndStop2([Stop])
    end

    %% ============ PHASE 3 ============
    subgraph Phase3["PHASE 3 — Build Dataset via Labeling"]
        direction TB
        P3Start["1. mcp: search_traces validated:true<br/>collect already-validated traces"] --> P3Step2["2. mcp: search_traces (no filter)<br/>+ read_traces scope:summary<br/>find diverse unlabeled candidates"]
        P3Step2 --> P3Step3[/"3. AskUserQuestion:<br/>approve / adjust / skip candidates"/]
        P3Step3 --> P3Step4["4. ★ HARD RULE ★<br/>Read code (Phase 2 file location)<br/>read_traces scope:full<br/>save_agent_labels with label + annotation<br/>BEFORE running label.js"]
        P3Step4 --> P3Step5["5. node label.js traceId1 traceId2 ...<br/>opens labeling UI in browser"]
        P3Step5 --> P3Step6["6. Wait for label.js to exit<br/>(blocks until user finishes)"]
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

    P4Plan --> P5Fork

    %% ============ PHASE 5 ============
    subgraph Phase5["PHASE 5 — Iterate with Replay"]
        direction TB
        P5Fork["Fork independent experiments<br/>to subagents via Agent tool<br/>(isolation: worktree)"] --> P5Step1[/"Step 1: AskUserQuestion<br/>explain change, get confirmation"/]
        P5Step1 --> P5Edit["Edit iteration target<br/>(prompt, code, params, BAML)"]
        P5Edit --> P5Step2["Step 2: Replay against dataset<br/>replay script --trace-ids id1,id2,..."]
        P5Step2 --> P5Step3["Step 3: Evaluate vs labels & annotations<br/>fail: did fix address annotation?<br/>pass: did it regress?"]
        P5Step3 --> P5Step4[/"Step 4: Share results<br/>show full table, highlight best,<br/>recommend continue / replan / stop"/]
        P5Step4 --> P5Outcome{Outcome}
        P5Outcome -- "Improved + no regressions:<br/>continue iterating" --> P5Step1
        P5Outcome -- "Regressions or no improvement:<br/>new experiment plan" --> P4Step3
        P5Outcome -- "Stop iterating" --> P6Step1
    end

    %% ============ PHASE 6 ============
    subgraph Phase6["PHASE 6 — Validate & Wrap Up"]
        direction TB
        P6Step1[/"Summary AskUserQuestion:<br/>failed traces fixed,<br/>pass rate, files changed"/] --> P6End([Done — changes uncommitted in working tree])
    end

    %% Styling
    classDef terminal fill:#dcfce7,stroke:#166534,color:#000
    classDef question fill:#fae8ff,stroke:#86198f,color:#000
    classDef constraint fill:#fee2e2,stroke:#b91c1c,color:#000

    class EndStop1,EndStop2,P6End terminal
    class P1Ask,P2InstAsk,P2RepAsk,P3Step3,P3Approve,P4Plan,P5Step1,P5Step4 question
    class P3Step4,P3Gate,P4Buckets constraint
```

## Key invariants the diagram enforces

1. **Pre-label before UI (HARD RULE).** Phase 3 Step 4 must call `mcp: save_agent_labels` with verdicts + annotations for every approved trace **before** Step 5 runs `label.js`. The user enters the labeling UI to confirm or correct Claude's verdicts, never to label from scratch. Skipping this is a process violation.

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

9. **No hallucinated function descriptions in Phase 1.** The list shown to the user uses only data returned by `list_trace_functions` (keys, trace counts, last activity). Claude never invents a description from the key name — key names are often ambiguous or misleading and guessed descriptions confuse the user. Each returned key is additionally cross-checked against the local codebase via `grep`, and each entry is marked ✅ instrumented here (with path) or ⚠️ not found in this repo so the user can see ground truth before picking.

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

## How to update

When `commands/improve.md` changes (steps added, removed, reordered, branches changed, MCP tools swapped, hard rules added/removed), update the Mermaid block above and re-render to verify. The diagram and the skill must agree — they document the same flow.

Same edits should be mirrored to `bitfab-cursor-plugin/skills/bitfab-improve/SKILL.md` per the CLAUDE.md plugin sync rule.
