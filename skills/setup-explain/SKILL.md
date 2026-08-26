---
name: setup-explain
description: Explain phase of the Bitfab Setup flow. Invoked by the setup flow; not run directly
user-invocable: false
---

# Bitfab Setup: Explain

**Mode:** you were dispatched with a mode (`wizard` or `explain`); which steps apply and where they route below depend on it.

**Run only when mode is `wizard` or `explain`.**

Teach the two primitives the user has to instrument with. Read-only, no code changes, no Studio. Runs inside `wizard` (right after Login, before the approach question) and standalone via `/bitfab:setup explain` (or natural-language asks like "what is Bitfab" / "explain Bitfab"), which needs no authentication.

1. Render the block below **verbatim** as a single message, as formatted markdown (do **not** wrap it in a code fence, do **not** reword it, and do **not** add a summary or an ASCII diagram). This is the education the rest of setup depends on: a user who does not understand `withSpan` and `replay` cannot make the per-method decisions instrumentation asks of them. Do **not** authenticate, scan the codebase, use AskUserQuestion, or edit anything here, in either mode.

   ```markdown
   **Purpose**

   Bitfab's SDK captures each instrumented method's inputs, outputs, and surrounding context as a trace at runtime. During development, developers and coding agents can inject captured trace data and modify code execution at the per-method level to test AI features end-to-end.

   **How to instrument**

   Bitfab provides you a way to capture traces and replay them safely during development. The core primitives from the Bitfab SDK are:

   - `withSpan(...)`
   - `replay(...)`

   `withSpan` captures traces and sends them to Bitfab by default. It serializes the inputs, outputs, and metadata of the method it wraps (or decorates) and sends them over the OTEL transport layer.

   `replay` calls into your code and modifies the behavior of `withSpan` for each method it wraps (or decorates) in one of five ways:

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
     /bitfab:setup view       Open one trace function's plan in the browser (read-only)
     /bitfab:setup replay     Create or update replay registry modules
     /bitfab:setup templates  Change how a trace function's spans render
     /bitfab:setup session-logs  Opt in/out of session log collection
   ```

   then close with one line: to start tracing, run `/bitfab:setup`; to debug an existing setup, run `/bitfab:setup inspect`. Then stop.

   **Next:**

   - Mode `wizard`: invoke the `setup-approach` skill with mode `wizard`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
   - Mode `explain`: invoke the `setup-cleanup` skill with mode `explain`, forwarding `$ARGUMENTS` minus the leading mode keyword (if the user typed one).
