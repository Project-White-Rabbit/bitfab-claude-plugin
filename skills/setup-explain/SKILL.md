---
name: setup-explain
description: Explain phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
---

# Bitfab Setup: Explain

**Mode:** you were dispatched with a mode (`wizard` or `explain`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard` or `explain`.**

Teach the opt-out tracing and replay primitives the user instruments with. Read-only, no code changes, no browser interaction. Runs inside `wizard` (right after Login, before the approach question) and standalone via `/bitfab:setup explain` (or natural-language asks like "what is Bitfab" / "explain Bitfab"), which needs no authentication.

1. Render the block below **verbatim** as a single message, as formatted markdown (do **not** wrap it in a code fence, do **not** reword it, and do **not** add a summary or an ASCII diagram). This is the education the rest of setup depends on: a user who does not understand `withTrace`, `withNode`, and `replay` cannot make the capture and replay decisions instrumentation asks of them. Do **not** authenticate, scan the codebase, use AskUserQuestion, or edit anything here, in either mode.

   ```markdown
   **Purpose**

   Bitfab's SDK captures each instrumented method's inputs, outputs, and surrounding context as a trace at runtime. During development, developers and coding agents can inject captured trace data and modify code execution at the per-method level to test AI features end-to-end.

   **How to instrument**

   Bitfab provides opt-out tracing and safe replay during development. For TypeScript and Python 3.12+, the core primitives are:

   - `withTrace(...)` / `trace(...)` for one workflow root
   - `withNode(...)` / `node(...)` to configure a discovered call
   - `replay(...)` to run recorded scenarios against current code

   Default to opt-out tracing. A trace root records its serializable inputs and output plus every first-party call beneath it. Most descendants need no wrapper. Add a node only when a call needs a name, type, capture override, finalizer, or replay-mocking policy. TypeScript requires the matching `@bitfab/transform` build adapter; setup installs and configures it. Python requires 3.12+. Opt-in spans remain supported; setup uses them as the fallback for Ruby, Go, unsupported runtimes, and live streaming roots that opt-out tracing cannot finalize without changing behavior. Keep one tracing surface per call stack. Never mix `withSpan` beneath `withTrace`; the SDK rejects mixed tracing surfaces.

   `replay` calls into your trace root and can modify each captured descendant in one of five ways:

   1. Execute as normal
   2. Pass in inputs from the recorded trace
   3. Pass in modified inputs from the recorded trace
   4. Skip execution and return outputs from the recorded trace
   5. Skip execution and return modified outputs from the recorded trace
   ```

   If the user asks about a framework (or once one is detected later in setup), follow up by explaining how that framework maps onto the five cases above. The principles do not change; only the way it gets instrumented does.

   **Unless the mode is `explain`:**

   Stop there and continue to the `setup-approach` skill. Do not render the mode menu below: mid-setup, a menu of other modes is noise.

   **Only when the mode is `explain`:**

   Follow the block above with this one, as a code block, exactly as laid out:

   ```
   What you can run
     /bitfab:setup            Login, then instrument workflows until done
     /bitfab:setup explain    This overview (read-only)
     /bitfab:setup login      Authenticate with Bitfab
     /bitfab:setup instrument Wrap a new AI workflow with tracing
     /bitfab:setup modify     Adjust what an existing trace captures
     /bitfab:setup inspect    Diagnose + fix setup: auth, what's instrumented, SDK/plugin current, replay coverage, traces arriving
     /bitfab:setup switch-org Switch which org the plugin reads and writes
     /bitfab:setup replay     Create or update replay registry modules
     /bitfab:setup templates  Change how a trace function's spans render
     /bitfab:setup session-logs  Opt in/out of session log collection
   ```

   then close with one line: to start tracing, run `/bitfab:setup`; to debug an existing setup, run `/bitfab:setup inspect`. Then stop.

   **Next:**

   - Mode `wizard`: invoke the `setup-approach` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `explain`: invoke the `setup-cleanup` skill with mode `explain`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
