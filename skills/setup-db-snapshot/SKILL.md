---
name: setup-db-snapshot
description: DB Snapshot phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write", "WebFetch", "mcp__plugin_bitfab_Bitfab__get_database_connection_status", "Skill"]
---

# Bitfab Setup: DB Snapshot

**Run only when mode is `db-snapshot`.**

Set up **per-trace database snapshots for replay** so the team can re-run a historical trace against the database state that existed *when the trace was captured*, not today's data. This is what makes replay trustworthy for any code that reads stored state (a refund decision over a since-cancelled order, a retrieval step over last week's rows). Triggered explicitly by `/bitfab:setup db-snapshot`, never reached from `wizard`.

**Available for TypeScript, Python, and Ruby** (the SDKs with replay). Go has no replay, so DB-snapshot replay does not apply, if the project is Go, say so and stop.

**Capture is automatic, there is nothing to turn on.** Every root trace already pins the wall-clock instant it ran (no client config required), so any trace can later be replayed against its historical DB state. Setup is therefore just two pieces:
1. **Connect the database once** in the Bitfab dashboard. The source database can be **any Postgres**: Bitfab provisions a branchable managed copy from it. A one-time, dashboard-side step.
2. **Wire replay** to read the per-trace branch URL: pass `dbBranch` to the replay call and, inside the replayed function, connect using the resolved branch's URL instead of your live `DATABASE_URL`.

**Source of truth:** read https://docs.bitfab.ai/db-branching.md (the end-to-end, per-language setup) and your SDK's reference (`/reference/typescript.md`, `/reference/python.md`, `/reference/ruby.md`) for the exact `replay` / branch-accessor signatures before editing any code. The replay option and the accessor names differ per SDK, do not improvise from memory.

1. **Confirm the SDK language.** DB-snapshot replay is available for **TypeScript, Python, and Ruby**. If the project is **Go**, tell the user Go has no replay so this doesn't apply, and route to cleanup.

   **Check authentication.** Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/commands/status.js"
   ```

   If it reports not authenticated, run `node "${CLAUDE_PLUGIN_ROOT}/dist/commands/login.js"` (blocks until the browser login completes), then continue.

   **Locate the replay script(s)** you'll edit later: search for files importing/calling the SDK's `replay` (commonly under `scripts/`). If there are **no** replay scripts yet, tell the user to run `/bitfab:setup replay` first to create them, then come back (route to cleanup), DB-snapshot augments an existing replay script, it does not create one from scratch. No client-config edit is needed: snapshot capture is always on, so there is nothing to add to `new Bitfab({ ... })`.

   **Next:**

   - The project is Go, or there are no replay scripts to augment yet (mode `db-snapshot`): invoke the `setup-cleanup` skill with mode `db-snapshot`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
2. Call `mcp__plugin_bitfab_Bitfab__get_database_connection_status` once to read the current state:
   - **`connected`**: the database is already connected and provisioned. Tell the user, and continue to the next step.
   - **`none`**: no database is connected yet. The tool's response includes the exact **Integrations** URL. Relay it to the user and ask them to open it, go to the **Database** section, and paste their Postgres connection string. Provisioning the branchable copy takes a few minutes.
   - **`checking`**: a connection is already provisioning; continue to the wait step.
   - **`failed`**: a previous attempt failed. Point the user back to the Integrations page (Database section) to re-check the connection string, then continue.

   Do **not** ask the user to set any `BITFAB_NEON_*` or `NEON_API_KEY` environment variables, those are Bitfab-side server config, not customer config. The customer only pastes their source Postgres URL in the dashboard.
3. Poll `mcp__plugin_bitfab_Bitfab__get_database_connection_status` until the database is `connected`. Provisioning (source discovery + engine setup) takes a few minutes, so this loops:

   - **status is connected**: the branchable copy is provisioned, continue to wiring replay → step 4
   - **status is checking**: still provisioning, wait ~15s, then re-check → step 3
   - **status is none or failed**: not connected yet, re-surface the Integrations URL, then re-check → step 3

   When the status is `checking`, wait ~15 seconds before calling the tool again, do not hammer it. When it is `none` or `failed`, the user hasn't finished connecting (or it errored); re-surface the Integrations URL, give them a moment, then re-check. Only proceed once it reports `connected`.
4. Update the replay script(s) from step 1 so the replayed function connects to the per-trace branch. Ground every edit in https://docs.bitfab.ai/db-branching.md and your SDK's `replay` / branch-accessor reference, fetch the page for the project's language first; the replay option and the accessor names differ per SDK.

   1. **Turn branching on** by passing `dbBranch: true` to the replay call. That branches with the mirror's own sizing; pass an object instead only to tune the branch's compute or warm-up SQL. Use the form for the project's language:

   **TypeScript**: `dbBranch` on the replay options:

   ```ts
   const result = await client.replay("my-function", myInstrumentedFn, {
     limit: 10,
     dbBranch: true,
   })
   ```

   **Python**: `db_branch=`:

   ```python
   result = client.replay(my_instrumented_fn, limit=10, db_branch=True)
   ```

   **Ruby**: `db_branch:`:

   ```ruby
   result = client.replay(
     receiver, :my_method,
     trace_function_key: "my-function",
     limit: 10,
     db_branch: true,
   )
   ```

   2. **Inside the replayed function, connect through the branch URL** instead of your live `DATABASE_URL`. The accessor returns the branch resolved for the item currently running, or null when there is none:
   - **TypeScript:** `const branch = getCurrentReplayBranch()`, then `const url = branch?.databaseUrl ?? process.env.DATABASE_URL`
   - **Python:** `branch = get_current_replay_branch()`, then `url = branch.database_url if branch else os.environ["DATABASE_URL"]`
   - **Ruby:** `branch = Bitfab.current_replay_branch`, then `url = branch ? branch.database_url : ENV["DATABASE_URL"]`

   Always keep the fallback: the accessor is **null** on the normal live request path, and for traces captured before the SDK version that added always-on snapshot capture.

   3. **Resolve the connection per call, not at module/import time.** A pool created once at import (a module-level `Pool` / engine / connection bound to `DATABASE_URL`) will never see the branch URL. If the app pins its DB client at import, refactor so the replayed function can build (or be handed) a client from the branch URL for the duration of the item. Flag this when you spot an import-time pool, it's the most common reason a wired replay still hits production data.

   Leave the live request path untouched: only the replayed function reads the branch. (Optional, TypeScript only: you can pass `dbSnapshot: { provider: "neon" }` to `new Bitfab({ ... })` to pin the provider at capture time. It is **not required**: capture works without it; the provider is otherwise resolved at replay time.)
5. Verify the wiring end-to-end with a **recently captured** trace. Capture is automatic, but a trace only carries a snapshot ref if it was recorded by an SDK version with always-on capture, so use a fresh one to be safe:

   1. Run the instrumented function once (or have the user trigger it) so a new trace lands.
   2. Run the replay script against that trace (e.g. `pnpm with-env tsx scripts/replay.ts <pipeline> --limit 1`, `python scripts/replay.py <pipeline> --limit 1`, `bundle exec ruby scripts/replay.rb <pipeline> --limit 1`, or the project's equivalent, with the app environment loaded).
   3. Confirm the branch was injected: inside the replayed function, the environment's active flag should be **true** and its branch URL's host/database should differ from the app's normal `DATABASE_URL`. Print the test run URL from the replay output so the user can open the experiment.

   If the active flag is **false** for a freshly captured trace, either the source database isn't connected (re-check the dashboard Database section, step 2) or the SDK predates always-on capture (upgrade with `/bitfab:update`).

   Caveats to surface to the user: each branch lease is short-lived (a few minutes) and is created fresh per replay item; the branch reflects the source database's state at the snapshot instant, bounded by replication lag (typically sub-second to a few seconds).

   **Next:**

   - Mode `db-snapshot`: invoke the `setup-cleanup` skill with mode `db-snapshot`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
