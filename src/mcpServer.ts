import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { getConfig } from "./config.js"
import { McpProxy } from "./mcpProxy.js"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const proxy = new McpProxy()

function proxyToolCall(toolName: string, args: Record<string, unknown>) {
  return proxy.toolCall(getConfig(), toolName, args)
}

const server = new McpServer({
  name: "Bitfab",
  version: "1.0.0",
})

server.tool(
  "setup_bitfab",
  "Get the full setup guide for instrumenting your code with the Bitfab SDK. Returns install commands, initialization code, instrumentation patterns, and guidance on choosing the right granularity for trace functions. Call this first when setting up Bitfab. Read the guide's 'Choosing What to Instrument' section before deciding what to trace.",
  {
    language: z.enum(["typescript", "python", "ruby", "go"]),
  },
  async ({ language }) => proxyToolCall("setup_bitfab", { language }),
)

server.tool(
  "get_bitfab_api_key",
  "Get your Bitfab API key for SDK initialization. Returns the plaintext key to use in environment variables. Call this after setup_bitfab to configure the BITFAB_API_KEY environment variable.",
  {},
  async () => proxyToolCall("get_bitfab_api_key", {}),
)

server.tool(
  "list_trace_functions",
  "List all traced functions in your organization with evaluation stats per function. Use this to see evaluation status at a glance. Call get_trace_function_diagnostics with a specific traceFunctionKey to drill into failure details.",
  {},
  async () => proxyToolCall("list_trace_functions", {}),
)

server.tool(
  "get_trace_function_diagnostics",
  "Get detailed failure diagnostics for a specific traced function — includes evaluation criteria, failure summaries, and recent individual failures with trace IDs. Use this to understand exactly why traces are failing so you can make targeted code fixes. You can call this directly if you already know the traceFunctionKey from the codebase, or use list_trace_functions first to discover available keys.",
  {
    traceFunctionKey: z
      .string()
      .describe("The function key to get diagnostics for"),
    graderId: z
      .string()
      .optional()
      .describe("Optional: scope to a single grader ID"),
  },
  async ({ traceFunctionKey, graderId }) =>
    proxyToolCall("get_trace_function_diagnostics", {
      traceFunctionKey,
      graderId,
    }),
)

server.tool(
  "create_grader",
  "Create a failure-mode grader specification for a traced function. Use this after identifying a failure pattern in the user's AI agent — the traceFunctionKey must match a function instrumented with the Bitfab SDK. The grader records what to evaluate (evaluationFocus) and optionally how to distinguish pass/fail cases. Call list_graders first to check if a similar grader already exists.",
  {
    traceFunctionKey: z
      .string()
      .describe("The trace function key from the instrumented source code"),
    name: z
      .string()
      .describe(
        "A short, descriptive name for this grader (e.g. 'Hallucination check')",
      ),
    evaluationFocus: z
      .string()
      .describe(
        "What this grader evaluates — describe the failure mode or quality dimension",
      ),
    passCriteria: z
      .string()
      .optional()
      .describe("What a passing result looks like"),
    failCriteria: z
      .string()
      .optional()
      .describe("What a failing result looks like"),
    archived: z
      .boolean()
      .optional()
      .describe("Set to true to archive (soft-delete) this grader"),
  },
  async ({
    traceFunctionKey,
    name,
    evaluationFocus,
    passCriteria,
    failCriteria,
    archived,
  }) =>
    proxyToolCall("create_grader", {
      traceFunctionKey,
      name,
      evaluationFocus,
      passCriteria,
      failCriteria,
      archived,
    }),
)

server.tool(
  "list_graders",
  'List all graders and their criteria for a traced function. Call this at the start of a session to understand existing failure-mode specifications before making improvements, or before creating a new grader to avoid duplicates. IMPORTANT: When working on a user\'s AI agent codebase, always specify a status filter — use status="active" to see graders currently evaluating traces, status="live" for production-ready graders, or status="specification" for grader specs that haven\'t been trained yet. Without a status filter, you\'ll get all graders including archived and candidate ones, which adds noise.',
  {
    traceFunctionKey: z
      .string()
      .describe("The trace function key to list graders for"),
    status: z
      .string()
      .optional()
      .describe(
        "Filter by grader status: candidate, active, training, live, archived, or specification",
      ),
    type: z
      .string()
      .optional()
      .describe(
        "Filter by grader type: code_javascript or bitfab_llm_as_judge",
      ),
    verbose: z
      .boolean()
      .optional()
      .describe(
        "Show full criteria details for all graders. Specification graders always show full details regardless of this flag.",
      ),
  },
  async ({ traceFunctionKey, status, type, verbose }) =>
    proxyToolCall("list_graders", { traceFunctionKey, status, type, verbose }),
)

server.tool(
  "search_traces",
  "Search and filter traces for a traced function. Returns matching traces with IDs, status, timestamps, and output preview. Supports keyword search, date range, status filter, regex matching, and grader evaluation filters. Use drillDown to refine previous results.",
  {
    traceFunctionKey: z.string().describe("The trace function key to search"),
    searchQuery: z.string().optional().describe("Full-text keyword search"),
    status: z
      .enum(["pending", "completed", "failed"])
      .optional()
      .describe("Filter by trace status"),
    createdAfter: z
      .string()
      .regex(DATE_PATTERN, "Must be YYYY-MM-DD format")
      .optional()
      .describe("Only traces after this date (YYYY-MM-DD)"),
    createdBefore: z
      .string()
      .regex(DATE_PATTERN, "Must be YYYY-MM-DD format")
      .optional()
      .describe("Only traces before this date (YYYY-MM-DD)"),
    traceFilterRegex: z
      .string()
      .optional()
      .describe("Regex to filter trace output"),
    graderIds: z.array(z.uuid()).optional().describe("Filter by grader IDs"),
    graderResult: z
      .boolean()
      .optional()
      .describe("Filter by grader result (true=pass, false=fail)"),
    graderSource: z
      .enum(["human", "live_grader"])
      .optional()
      .describe("Filter by grader label source"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Max traces to return (default 10, max 50)"),
    drillDown: z
      .boolean()
      .optional()
      .describe(
        "If true, merge with previous search filters to narrow results",
      ),
    traceIds: z
      .array(z.uuid())
      .optional()
      .describe("Specific trace IDs to fetch"),
  },
  async (args) => proxyToolCall("search_traces", args),
)

server.tool(
  "read_traces",
  'Read one or more traces by ID — includes inputs, outputs, and status. By default returns span summaries; set scope="full" to get full span details (input, output, reasoning, context, errors).',
  {
    traceIds: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .describe("Trace IDs to read (1-10)"),
    scope: z
      .enum(["summary", "full"])
      .optional()
      .describe(
        'Level of span detail: "summary" (default) for one-line summaries, "full" for complete input/output/reasoning/content/errors',
      ),
  },
  async ({ traceIds, scope }) =>
    proxyToolCall("read_traces", { traceIds, scope }),
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("Bitfab MCP server failed to start:", err)
  process.exit(1)
})
