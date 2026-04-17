# `/bitfab:setup` Skill Flow

Visual reference for the four phases of the Bitfab setup skill (`commands/setup.md`).
Edit the Mermaid block below to keep this in sync with the skill.

## Full flow

```mermaid
flowchart TD
    Start([User invokes /bitfab:setup mode]) --> ModeCheck{Mode}
    ModeCheck -->|all| P0
    ModeCheck -->|login| L1
    ModeCheck -->|instrument| I1
    ModeCheck -->|modify| M1
    ModeCheck -->|replay| R1

    %% ============ PREAMBLE ============
    P0["0. Preamble<br/>render CODE→TRACES→DATASETS→IMPROVE block verbatim<br/>no AskUserQuestion, no confirmation"] --> L1

    %% ============ LOGIN PHASE ============
    subgraph LoginPhase["LOGIN PHASE"]
        direction TB
        L1["1. Run status check<br/>node status.js"] --> LAuth{Authenticated?}
        LAuth -- No --> LRun["Run login script<br/>node login.js — opens OAuth in browser"]
        LAuth -- Yes --> LKey["2. mcp: get_bitfab_api_key<br/>NEVER print full key"]
        LRun --> LKey
    end

    LKey --> LStop{login mode only?}
    LStop -- Yes --> EndLogin([Stop, report result])
    LStop -- No --> I1

    %% ============ INSTRUMENT PHASE ============
    subgraph InstrPhase["INSTRUMENT PHASE"]
        direction TB
        I1["1. Detect language<br/>identify apps vs libraries"] --> I2["2. Search for existing SDK usage<br/>per app dir in monorepos"]
        I2 --> ISDK{Existing<br/>SDK usage?}
        ISDK -- Yes --> IAskMore[/"AskUserQuestion:<br/>• Search more workflows<br/>• Modify existing trace setup<br/>• Continue to Replay"/]
        IAskMore -- Continue --> R1
        IAskMore -- Modify --> M1
        IAskMore -- Search more --> I345
        ISDK -- No --> I345

        I345["3-5. API key, install SDK,<br/>write BITFAB_API_KEY to app .env<br/>(+ gitignore),<br/>fetch docs.bitfab.ai/&lt;lang&gt;-sdk"] --> I6["6. Choose root span =<br/>★ outer workflow function ★<br/>NEVER the LLM/agent SDK call itself"]
        I6 --> I7["7. Read codebase<br/>find ALL AI workflows + work<br/>above / alongside / below SDK calls"]
        I7 --> I8["8. Present numbered list:<br/>trace boundary, end-to-end scope,<br/>why valuable<br/>★ Pick exactly ONE workflow ★<br/>NEVER multiple, NEVER all"]
        I8 --> I8Serial{"Inputs serializable<br/>by SDK tracing layer?"}
        I8Serial -- "No (live runtime objects)" --> I8Resolve[/"AskUserQuestion in step 8 entry:<br/>(a) move boundary inward<br/>(b) refactor"/]
        I8Resolve -- "(b) refactor" --> I8RefactorPlan[/"Refactor confirmation:<br/>plan labeled visibility or structural<br/>(source, extraction, trace wrap, call sites)<br/>AskUserQuestion: Apply / Cancel"/]
        I8RefactorPlan -- Cancel --> I8Resolve
        I8RefactorPlan -- Apply --> I9
        I8Resolve -- "(a) move inward" --> I9
        I8Serial -- Yes --> I9["9. Read signatures the plan references<br/>skip leaves whose shape isn't in the plan"]
        I9 --> I10Build["10a. Build trace plan under<br/>★ PURELY ADDITIVE ★ constraint<br/>★ Processor SDKs: extend beyond ★<br/>(hybrid manual + auto) by default"]
        I10Build --> IAdd{Requires<br/>behavior change?}
        IAdd -- Yes --> IRestructure["Restructure the TREE:<br/>siblings, separate cycles,<br/>or flatter shape"]
        IRestructure --> I10Build
        IAdd -- No --> I10Present["10b. Present trace plan<br/>AskUserQuestion to confirm"]
        I10Present --> IConfirm{User approves?}
        IConfirm -- Adjust --> I10Build
        IConfirm -- Approve --> I11["11. Instrument<br/>purely additive — no behavior change<br/>batch repetitive edits in parallel;<br/>>10-file fan-outs → subagent"]
        I11 --> I12["12. Tell user how to run app<br/>do NOT run yourself"]
        I12 --> I13["★ MANDATORY STOP ★<br/>13. mcp: search_traces (only call site)<br/>empty result is expected"]
        I13 --> INext[/"AskUserQuestion (always):<br/>A) Generate traces (only if none exist)<br/>B) Instrument next workflow<br/>C) Other workflow<br/>D) Done"/]
        INext -- A --> I8
        INext -- B --> I8
        INext -- C --> I8
        INext -- D --> IStop
    end

    IStop{instrument mode only?} -- Yes --> EndInstr([Stop])
    IStop -- No --> R1

    %% ============ MODIFY PHASE ============
    subgraph ModifyPhase["MODIFY PHASE"]
        direction TB
        M1["1. Gather existing trace functions<br/>grep getFunction / get_function / etc."] --> MExists{Any<br/>existing keys?}
        MExists -- No --> MNone([Tell user to run<br/>/bitfab:setup instrument, stop])
        MExists -- Yes --> M2["2. ★ Pick exactly ONE trace function ★<br/>AskUserQuestion with existing keys"]
        M2 --> M3["3. Reconstruct the current trace plan<br/>read instrumented files — 'before' state"]
        M3 --> M4[/"4. ★ Pick exactly ONE direction ★<br/>AskUserQuestion (5 directions):<br/>1) Add context<br/>2) Increase depth<br/>3) Reduce depth<br/>4) Move root upstream<br/>5) Move root downstream"/]
        M4 --> M5Build["5. Build modified trace plan under<br/>★ PURELY ADDITIVE ★ constraint<br/>apply direction-specific rules"]
        M5Build --> MAdd{Requires<br/>behavior change?}
        MAdd -- Yes --> MInvalid["Direction invalid for this tree:<br/>explain why, return to step 4<br/>(or split into multiple cycles)"]
        MInvalid --> M4
        MAdd -- No --> M6["6. Present BEFORE/AFTER diff<br/>AskUserQuestion:<br/>Proceed / Expand / Adjust / Cancel"]
        M6 -- Adjust --> M5Build
        M6 -- Cancel --> MCancel([Stop])
        M6 -- Expand --> M6
        M6 -- Proceed --> M7{Direction 4 or 5?<br/>(root moved)}
        M7 -- Yes --> M7Key[/"7. AskUserQuestion:<br/>Keep key / Rename"/]
        M7 -- No --> M8
        M7Key --> M8["8. Apply changes — purely additive<br/>removing withSpan wrapper allowed only<br/>in direction 3; batch edits in parallel"]
        M8 --> M9["9. Tell user how to run app<br/>do NOT run yourself"]
        M9 --> MNext[/"★ MANDATORY STOP ★<br/>AskUserQuestion:<br/>A) Generate trace<br/>B) Modify another trace function<br/>C) Done"/]
        MNext -- B --> M2
    end

    MNext -- A --> EndModify([Stop])
    MNext -- C --> EndModify

    %% ============ REPLAY PHASE ============
    subgraph ReplayPhase["REPLAY PHASE"]
        direction TB
        R1["1. Gather all trace function keys<br/>grep getFunction / get_function / etc."] --> R2["2. Search for existing replay scripts<br/>scripts/replay.* and SDK replay imports"]
        R2 --> RCov{Coverage}
        RCov -- "Exists,<br/>all keys covered" --> EndUpToDate([Report up to date, stop])
        RCov -- "Exists,<br/>missing keys" --> R4
        RCov -- "None exist" --> R4
        R4["4. Create replay script<br/>per language, --limit, --trace-ids,<br/>per-pipeline replay fns importing actual functions<br/>(factory patterns: mock runtime context)"] --> R5Check{"5. Safety net: legacy function<br/>slipped past step-6 gate<br/>and can't be invoked?"}
        R5Check -- No --> EndDone([Done])
        R5Check -- Yes --> RAskRefactor[/"AskUserQuestion:<br/>Move boundary inward<br/>/ Refactor pure core (Recommended)<br/>/ Leave as-is (document)"/]
        RAskRefactor -- "Move / Refactor" --> R5Reinstrument["Return to step 6<br/>and re-instrument"] --> EndDone
        RAskRefactor -- Leave --> R5Document["Add infra header comment,<br/>flag that script will rot"] --> EndDone
    end

    %% Styling
    classDef terminal fill:#dcfce7,stroke:#166534,color:#000
    classDef question fill:#fae8ff,stroke:#86198f,color:#000
    classDef constraint fill:#fee2e2,stroke:#b91c1c,color:#000

    class EndLogin,EndInstr,EndUpToDate,EndDone,EndModify,MNone,MCancel terminal
    class IAskMore,INext,RAskRefactor,I8Resolve,I8RefactorPlan,M6,M7Key,MNext question
    class I8,I10Build,IRestructure,I11,M2,M4,M5Build,MInvalid,M8 constraint
```

## Key invariants the diagram enforces

0. **Preamble runs once, only in `all` mode.** The explanation block (CODE → TRACES → DATASETS → IMPROVE, primitives, phase summary) renders verbatim at the start of `/bitfab:setup` / `/bitfab:setup all`, then flows directly into Login. No confirmation step, no marker file — sub-modes (`login`, `instrument`, `replay`) skip it entirely because the user has already chosen a phase.

1. **One workflow per Instrument cycle.** Step 8 takes exactly one workflow. The "next workflow" loop from step 13 always returns to step 8 — never to a parallel branch. This means one trace function, one trace plan, one set of code changes per cycle.

2. **Trace boundary = outer workflow, not the SDK/agent call.** Step 6 fixes the root as the outer workflow function (API handler, message processor, job runner, pipeline coordinator). The agent SDK's `run()` or the raw LLM call is never the root when there's a clear caller above it. Step 7 explicitly looks for work above / alongside / below any agent or SDK call so step 8's scope description and step 10's trace plan reflect end-to-end coverage, not just SDK internals.

3. **Trace processor SDKs default to hybrid plans.** When the SDK registers a processor (OpenAI Agents SDK, etc.), step 10a defaults to a hybrid plan: manual `●` spans wrap the workflow, the SDK call appears as one `(agent)` child whose grandchildren are `[auto]` lines, and other manual spans capture work above/alongside/below the SDK call. The bare auto-only plan is reserved for the rare case where the workflow truly is just the SDK call.

4. **Purely additive instrumentation.** Step 10a builds the trace plan under the constraint that the tree must be implementable without behavior changes. If a candidate tree requires `await`-ing a stream that wasn't awaited, delaying a call, reordering, blocking a callback, or restructuring control flow, the tree is invalid — restructure the *tree* (siblings, separate cycles, flatter shape), not the code.

5. **Trace plan presentation is gated.** The trace plan is never shown until the additive check passes (10a → 10b). Behavior-changing approaches are never offered as options.

6. **Skill mode gates.** `login` mode stops after the Login phase. `instrument` mode stops after the Instrument loop completes. `all` mode flows through login → instrument → replay (Modify is **not** part of `all`). `modify` mode jumps straight to Modify and does not auto-continue to Replay. `replay` mode jumps straight to Replay.

7. **Replay coverage is computed before action.** The Replay phase reads the current state first (existing keys + existing scripts), then takes one of three branches: all covered → stop, missing keys → add, none exist → create. No user prompt on any branch.

8. **Replay functions call real code.** Each pipeline's replay function imports and invokes the actual instrumented function — never a stub. Factory-created functions are wrapped by calling the factory with mocks for closure dependencies (stream writers, session objects).

9. **Standalone-invokability is a static check, not a runtime one.** Step 5 reasons from the instrumented function's signature and dependencies to decide if it can be called from the replay script — it never executes the script to verify. If the function takes HTTP req/res objects, reads middleware-injected state, or needs a live server, it's not standalone-invokable. Refactor (extract a pure core and move the trace wrap to it) is the recommended resolution; the "leave as-is" path requires a header comment flagging the infra dependency.

10. **Serializable inputs are a trace-boundary constraint, not a replay concern.** Step 6 forbids picking a root whose inputs can't be serialized by the SDK's language-native tracing layer (TS/JSON, Python/JSON via Pydantic, Ruby/`to_json`, Go/`json.Marshal`). Live browser objects, HTTP req/res, stream writers, sockets, middleware-carrying request contexts, open file handles, and live DB connections all fail this test. Step 8 surfaces the violation as part of the workflow entry and requires the user to pick **move boundary inward** or **refactor upfront** before step 9. The Replay-phase step 5 is only a safety net; the primary gate is at instrument time, not after code has been written.

11. **Refactors require a plan + second confirmation, and are labeled by flavor.** When the user picks "refactor" (or any option that modifies existing functions/call sites), the skill must first present a refactor plan labeled as **visibility** (extract + export, logic unchanged — most cases) or **structural** (new pure-core fn with serializable inputs — rare overall, common for realtime/streaming/browser apps). The plan lists source fn, extracted fn signature, trace wrap location, every rewritten call site. Then AskUserQuestion (`Apply` / `Cancel`) before touching code; Cancel returns to the originating AskUserQuestion. Does NOT apply to step 11's purely-additive instrumentation — only to paths that modify existing code.

12. **Replay is unconditional in `all` mode, and non-interactive once entered.** After Instrument step 13 option D in `all` mode, Replay always runs. Replay does not depend on traces existing — it reads trace function keys from code. Once inside Replay, there is no "Skip" branch: missing scripts get added and absent scripts get created without asking. The only Replay terminal state besides completion is "scripts exist and cover all keys, stop."

13. **Step 13 is a mandatory AskUserQuestion stop, and the only caller of `search_traces`.** The skill never silently transitions from Instrument to Replay; an empty `search_traces` result means "offer option A," not "skip." Replay does not check for traces — scripts are created from trace function keys in code.

14. **One trace function and one direction per Modify cycle.** Modify step 2 picks exactly one trace function; Modify step 4 picks exactly one of the five directions (add context / increase depth / reduce depth / move root upstream / move root downstream). Mixing directions or batching trace functions is forbidden — the user loops via the Modify step 9 menu if they want more.

15. **Purely additive modifications.** Modify step 5 enforces the same additive constraint as Instrument step 10a: if the chosen direction would require a behavior change, the direction is rejected (the user picks a different direction or splits into multiple cycles). Removing a `withSpan`/`@span` wrapper is the only structural edit allowed, and only under direction 3 (Reduce depth), and only when the underlying call stays intact.

16. **Before/after diff is gated on the same additive check.** Modify step 6 is only reached after step 5 proves the direction is additive; the diff is never shown alongside a behavior-changing option.

17. **Key rename is an explicit user decision.** Directions 4 and 5 (root moves) always prompt for keep-or-rename at Modify step 7. Directions 1–3 never prompt — the key is preserved.

18. **`BITFAB_API_KEY` is written to the app's env file, not just exported.** Step 4 of Instrument persists the key into `.env.local` / `.env.development` / `.env` in the app directory (create if missing), skips overwriting an existing `BITFAB_API_KEY=` line, and ensures the env file is gitignored. An in-shell `export` alone is insufficient — replay and the app both read from `.env`, so a missing file write causes silent trace loss. The confirmation to the user references the file path only; the key value is never printed.

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

When `commands/setup.md` changes (steps added, removed, reordered, or branching changes), update the Mermaid block above and re-render to verify. The diagram and the skill must agree — they document the same flow.

Same edits should be mirrored to `bitfab-cursor-plugin/skills/bitfab-setup/SKILL.md` per the CLAUDE.md plugin sync rule.
