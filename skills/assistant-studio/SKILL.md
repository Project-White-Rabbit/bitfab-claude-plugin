---
name: assistant-studio
description: Studio Lifecycle phase of the Bitfab Assistant flow. Invoked by the assistant flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "AskUserQuestion", "Skill"]
---

# Bitfab Assistant: Studio Lifecycle

**Mode:** you were dispatched with a mode (`wizard` or `dataset` or `experiment` or `cost-optimize` or `investigate` or `benchmark`); the gates and Next routing below depend on it.

**Run only when mode is `wizard`, `dataset`, `experiment`, `cost-optimize`, `investigate` or `benchmark`.**

The Studio is the companion browser surface for the assistant flow. In every mode that uses it, it opens once at the start and stays open throughout all phases, with individual phases navigating it to the relevant page (dataset review, experiment viewer, etc.) using `openStudioTo.js`. **`benchmark` is the exception:** it opens Studio only when the run passed the `studio` opt-in. A terminal-only `benchmark` run (no `studio` keyword) opens no Studio at all, and the `open` step below self-skips for it.

**`openStudioTo.js` handles session resolution automatically.** It takes a single `<path>` argument and reads auth from your local config. The active Studio session is the single source of truth on disk:
1. If an active session is recorded, it navigates that window to the path and reuses it.
2. If none is recorded, it opens a **new** Studio window at the path.

It never opens a second window while a session is recorded: it either reuses it or gates. A clean tab close or a deliberate end clears the record, so the next open is simply a fresh window.

Output events:
- `{"event":"navigated","sessionId":"...","path":"..."}`, reused an existing session.
- `{"event":"window-open-requested","url":"..."}`, a fresh Studio window open was *requested* (the browser launch was called), not confirmed on screen. Immediately surface the URL to the user in a normal chat message (for example, `Opening Studio: <url> - click it if a window doesn't appear`) so it is copyable from the transcript; on a remote/SSH session or with no supported browser nothing may surface, so the link is the reliable fallback.
- `{"event":"started","sessionId":"..."}`, opened a new Studio window.
- `{"event":"monitor","sessionId":"...","eventFile":"..."}`, the durable event stream path. Tail `eventFile` for the live in-session events (the daemon appends them there for the whole session, independent of any running command).
- `{"event":"not-responding","sessionId":"..."}`, a recorded session exists but the window did not respond (the navigation retries via ping-pong before reporting this, so the tab was pinged twice and never answered). **Every** Studio-opening command emits this on a stale session (`openStudioTo.js` and the dataset/experiment/trace-plan commands alike), and none of them opens a duplicate window. **This is a gate.** Recommend the user refresh or reopen the Studio tab in their browser, then use `AskUserQuestion` with two options: **Try again** (re-run the command that gated, the record is still on disk, so a window that came back gets reused) or **Open a new Studio** (run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/clearStudioSession.js"` to drop the stale record, then re-run the command, which now opens a fresh window). Only clear the record after the user approves. Some commands (e.g. `login`) also expose a `--force` flag for a user at a terminal to force-clear a stale session; never run `--force` yourself, surface the recovery to the user instead.
- `{"event":"open-failed","reason":"...","url":"..."}`, the browser process did not launch (e.g. `rate-limited`, `spawn-failed`), so no window opened. When a `url` is present, the Studio session is live and reachable, tell the user Studio couldn't open a browser (give the `reason`) and ask them to click the link to open it: `<url>`. The command keeps polling, so a manual click connects and the flow proceeds. (A bare `open-failed` with no `url` is a hard failure, surface the error.)

The gate fires only when a recorded window went unreachable with **no close signal**: a crash, sleep, or a tab close no process witnessed. A cleanly closed or deliberately ended session leaves no record, so the next open just opens fresh (no handshake, no prompt).

**Never use Playwright, `open`, `chrome-testing`, or any other browser automation to open Studio pages.** Always use `openStudioTo.js` which handles auth and session management.

1. **In `benchmark` mode, first check the Studio opt-in flag** (set during argument routing when the `studio` keyword was passed). If benchmark did NOT opt in, skip this entire step without running any command and continue to the `pick-dataset` step (Phase 5 Setup). In all other modes, and in `benchmark` with the `studio` flag, proceed.

   Open Studio at the initial path for this mode. `openStudioTo.js` is the single entry point for all Studio operations: it navigates an existing session or opens a new one automatically.

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js" <path>
   ```

   The command resolves this agent's active session on its own and reads auth from local config, no session id or credentials to pass.

   **The Studio daemon is the durable event buffer, not this process.** `openStudioTo.js` opens or navigates the session and prints handshake JSONL, including a `monitor` line with the path to a durable event file. Studio-opening commands may stay alive until the user acts in Studio, so always launch them with the host's background / long-running process mechanism, read stdout incrementally until you capture the handshake, and never block the conversation foreground waiting for the user. Events are appended to the `eventFile` by the daemon for the whole session, whether or not any command is still running, so you can never miss Done / Edit-with-agent / session-ended. **Capture the `eventFile` path from this step's `monitor` line; the `await-event` step tails that file, not this process's output.** Every later `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/openStudioTo.js"` call (dataset page, experiments page, trace plans) uses the same background/long-running process pattern against the same session and event file: you do not start a second monitor for them.

   **The path MUST start with `/studio`.** Never pass `/`, a bare URL, or any path outside the `/studio/` route tree.

   - **`wizard` mode:** pass `/studio`
   - **`dataset <key>` mode:** pass `/studio` (Phase 3's "Open the dataset review page" step navigates to the chosen dataset's own page once the datasetId is held; there is no function-level dataset page)
   - **`experiment <key>` mode:** pass `/studio`
   - **`fix [<key>] <trace-id>` mode:** this mode normally skips the initial Studio open and starts at Phase Fix. If you are here because the user later chose to inspect the single-trace before/after or run the full dataset experiment, pass `/studio` and continue with the experiment viewer flow.
   - **`cost-optimize <key>` mode:** pass `/studio`
   - **`investigate [<key>]` mode:** pass `/studio`
   - **`benchmark <key>` mode:** only when the run opted in with the `studio` keyword (the working-context flag from argument routing): pass `/studio`. Without the flag, benchmark is terminal-only: do NOT run `openStudioTo.js` at all, skip straight to the `pick-dataset` step (the step's `next` already routes there)

   `replay` mode never reaches this step (it runs entirely in-chat with no Studio session), see Phase Replay.

   Run it with `run_in_background: true` on the Bash tool so you can read its handshake output without blocking. **Do NOT append `&` to the command string.** On the daemon path it prints the handshake and exits immediately; in the rare no-daemon fallback it stays alive writing the event file itself. Either way you do the same thing: read the handshake, then tail the `eventFile` in `await-event`.

   The script outputs these handshake JSON lines on stdout (see the Studio Lifecycle intro for the full event reference):

   - `{"event":"window-open-requested","url":"..."}`, a fresh Studio window open was *requested* (not confirmed on screen). Immediately surface the URL, e.g. `Opening Studio: <url> - click it if a window doesn't appear`, before continuing to poll; the link is the reliable fallback when nothing surfaces.
   - `{"event":"started","sessionId":"..."}`, new Studio opened. The session is written to disk; all subsequent `openStudioTo.js` and `pushActivity.js` calls resolve it automatically. You do not need to track the sessionId.
   - `{"event":"navigated","sessionId":"...","path":"..."}`, navigated an existing session.
   - `{"event":"auth-required","sessionId":"..."}`, user needs to sign in. Wait for `authenticated`.
   - `{"event":"authenticated","sessionId":"..."}`, user signed in. Continue.
   - `{"event":"monitor","sessionId":"...","eventFile":"..."}`, the durable event stream lives at `eventFile`. **Record this path**, the `await-event` step tails it for the live stream (Done / Edit-with-agent / session-ended).

   Status messages go to stderr. Filter to JSON lines only. The live in-session events (Done, Edit-with-agent, session-ended) do NOT appear on this process's stdout, they go to the `eventFile`; tail it in `await-event`.

   **Recovering after compaction:** Automatic. `openStudioTo.js` and `pushActivity.js` read the active-session file on disk.

   **Next:**

   - Mode `wizard`: invoke the `assistant-identify-function` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `dataset`: invoke the `assistant-dataset` skill with mode `dataset`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `experiment` or `cost-optimize` or `benchmark`: invoke the `assistant-load-dataset` skill with the current mode (`experiment` or `cost-optimize` or `benchmark`), forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `investigate`: invoke the `assistant-investigate` skill with mode `investigate`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
