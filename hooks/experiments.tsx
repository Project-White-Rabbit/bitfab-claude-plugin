import type { EngineInterface, Register } from "claude-code"
import { atom, read, update } from "claude-code"
import type {
  ExperimentSnapshot,
  FinishedExperiment,
  RunningExperiment,
} from "../types"

const runningExperiments = atom(
  { plugin: "bitfab", key: "runningExperiments" } as const,
  [] as RunningExperiment[],
)
const finishedExperiments = atom(
  { plugin: "bitfab", key: "finishedExperiments" } as const,
  [] as FinishedExperiment[],
)
const stalledExperimentIds = atom(
  { plugin: "bitfab", key: "stalledExperimentIds" } as const,
  [] as string[],
)
const announcedExperimentIds = atom(
  { plugin: "bitfab", key: "announcedExperimentIds" } as const,
  [] as string[],
)

const MAX_ROWS = 5
const MAX_FINISHED_KEPT = 5
const SELECT_HINT = "ctrl+x tab to select, enter to press"
const ERRORED_SEPARATOR = ", "
const CLEARED_STORE_KEY = "clearedExperiments"
const CLEARED_KEPT_MS = 7 * 24 * 60 * 60_000

function experimentLabel(experiment: { id: string; name: string | null }) {
  return experiment.name ?? `Experiment ${experiment.id.slice(0, 8)}`
}

function progressLabel(counts: { finished: number; total: number | null }) {
  return counts.total === null
    ? `${counts.finished} replayed`
    : `${counts.finished}/${counts.total} replayed`
}

function stallText(experiment: RunningExperiment) {
  return [
    `Bitfab experiment ${experimentLabel(experiment)} (${experiment.id}) has replayed nothing new for 10 minutes and is still marked running (${progressLabel(experiment)}), ${experiment.url}`,
    "Check whether its replay process is still running and read that replay's output for an error; for a cloud replay, run bitfab-replay --cloud-status <execution UUID>. If the process is gone, get_replay_status says whether it can be resumed: rerun the same replay command with --resume <experiment id>.",
  ].join("\n")
}

async function wakeForStalls($: EngineInterface, running: RunningExperiment[]) {
  const alreadyWoken = new Set(await read($, stalledExperimentIds))
  const fresh = running.filter(
    (experiment) => experiment.stalled && !alreadyWoken.has(experiment.id),
  )
  if (fresh.length === 0) {
    return
  }
  await update($, stalledExperimentIds, (ids) => [
    ...ids,
    ...fresh.map((experiment) => experiment.id),
  ])
  for (const experiment of fresh) {
    $.ui.toast(`${experimentLabel(experiment)} has stalled`, {
      timeoutMs: 8000,
    })
    await $.prompt.submit({ text: stallText(experiment) })
  }
}

type LineColor = "yellow" | "green" | "red" | null

interface ExperimentLine {
  key: string
  id: string
  status: string
  statusColor: LineColor
  count: string
  errored: string
  label: string
  url: string
  clearable: boolean
}

function erroredText(errored: number | null | undefined) {
  return typeof errored === "number" && errored > 0
    ? `${ERRORED_SEPARATOR}${errored} errored`
    : ""
}

function everyReplayErrored(experiment: FinishedExperiment) {
  return (
    typeof experiment.errored === "number" &&
    experiment.errored > 0 &&
    experiment.errored === experiment.finished
  )
}

function finishedStatus(experiment: FinishedExperiment) {
  if (experiment.status !== "completed") {
    return experiment.status
  }
  return everyReplayErrored(experiment) ? "errored" : "complete"
}

function hasCounts(experiment: FinishedExperiment) {
  return experiment.status !== "failed"
}

function finishedErrored(experiment: FinishedExperiment) {
  return hasCounts(experiment) ? erroredText(experiment.errored) : ""
}

function finishedCount(experiment: FinishedExperiment) {
  return hasCounts(experiment) && typeof experiment.finished === "number"
    ? progressLabel({
        finished: experiment.finished,
        total: experiment.total ?? null,
      })
    : ""
}

function runningLine(experiment: RunningExperiment): ExperimentLine {
  return {
    key: experiment.id,
    id: experiment.id,
    status: experiment.stalled ? "stalled" : "running",
    statusColor: experiment.stalled ? "yellow" : null,
    count: progressLabel(experiment),
    errored: erroredText(experiment.errored),
    label: experimentLabel(experiment),
    url: experiment.url,
    clearable: false,
  }
}

function finishedLine(experiment: FinishedExperiment): ExperimentLine {
  return {
    key: `finished-${experiment.id}`,
    id: experiment.id,
    status: finishedStatus(experiment),
    statusColor: finishedStatus(experiment) === "complete" ? "green" : "red",
    count: finishedCount(experiment),
    errored: finishedErrored(experiment),
    label: experimentLabel(experiment),
    url: experiment.url,
    clearable: true,
  }
}

function columnWidths(lines: ExperimentLine[]) {
  return {
    status: Math.max(...lines.map((one) => one.status.length + 2)),
    count: Math.max(
      ...lines.map((one) => one.count.length + one.errored.length),
    ),
    label: Math.max(...lines.map((one) => one.label.length)),
  }
}

function finishLabel(experiment: FinishedExperiment) {
  const counts = `${finishedCount(experiment)}${finishedErrored(experiment)}`
  const outcome = `${experimentLabel(experiment)} ${finishedStatus(experiment)}`
  return counts.length > 0 ? `${outcome}, ${counts}` : outcome
}

function isSnapshot(value: unknown): value is ExperimentSnapshot {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return Array.isArray(record.running) && Array.isArray(record.finished)
}

function parseSnapshot(line: string): ExperimentSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(line)
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

let watching = false

function isClearedTimes(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((at) => typeof at === "number")
  )
}

async function readCleared($: EngineInterface) {
  const stored = await $.store.get(CLEARED_STORE_KEY).catch(() => undefined)
  return isClearedTimes(stored) ? stored : {}
}

async function rememberCleared($: EngineInterface, ids: string[]) {
  const now = await $.clock.now()
  const kept = Object.fromEntries(
    Object.entries(await readCleared($)).filter(
      ([, at]) => now - at < CLEARED_KEPT_MS,
    ),
  )
  for (const id of ids) {
    kept[id] = now
  }
  await $.store.set(CLEARED_STORE_KEY, kept).catch(() => undefined)
}

async function clearFinished($: EngineInterface, ids: string[] | null) {
  const cleared =
    ids ?? (await read($, finishedExperiments)).map((one) => one.id)
  await update($, finishedExperiments, (kept) =>
    kept.filter((one) => !cleared.includes(one.id)),
  )
  await rememberCleared($, cleared).catch(() => undefined)
}

async function announceFinished(
  $: EngineInterface,
  snapshot: ExperimentSnapshot,
) {
  const announced = new Set(await read($, announcedExperimentIds))
  const fresh = snapshot.finished.filter(
    (experiment) => !announced.has(experiment.id),
  )
  if (fresh.length === 0) {
    return
  }
  await update($, announcedExperimentIds, (ids) => [
    ...ids,
    ...fresh.map((experiment) => experiment.id),
  ])
  const cleared = await readCleared($)
  const shown = fresh.filter((experiment) => !(experiment.id in cleared))
  await update($, finishedExperiments, (kept) =>
    [...[...shown].reverse(), ...kept].slice(0, MAX_FINISHED_KEPT),
  )
  for (const experiment of shown.filter((one) => one.announce !== false)) {
    const text = finishLabel(experiment)
    $.ui.toast(text, { timeoutMs: 8000 })
    void $.ui
      .notify(`${text}: ${experiment.url}`, { title: "Bitfab" })
      .catch(() => undefined)
  }
}

async function applySnapshot($: EngineInterface, snapshot: ExperimentSnapshot) {
  await update($, runningExperiments, () => snapshot.running)
  await announceFinished($, snapshot)
  await wakeForStalls($, snapshot.running)
}

async function watch($: EngineInterface) {
  if (watching) {
    return
  }
  watching = true
  try {
    const sessionId = await $.session.id()
    const nodeBin = (await $.env.get("NODE_BIN")) ?? "node"
    const child = $.process.spawn({
      argv: [
        nodeBin,
        `${$.plugin.root}/dist/commands/watchRunningExperiments.js`,
        "--agent-session-id",
        sessionId,
      ],
    })
    let buffer = ""
    for await (const piece of child) {
      if (!("stream" in piece) || piece.stream !== "stdout") {
        continue
      }
      buffer += piece.text
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const snapshot = parseSnapshot(line)
        if (snapshot !== null) {
          await applySnapshot($, snapshot)
        }
      }
    }
  } catch (error) {
    $.ui.log(`Bitfab experiments watch stopped: ${String(error)}`, {
      to: "debug",
    })
  } finally {
    watching = false
    await update($, runningExperiments, () => [])
  }
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    const started = await next(e)
    void watch($)
    return started
  })

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const running = await read($, runningExperiments)
    const finished = await read($, finishedExperiments)
    if (e.props.hasSurvey || (running.length === 0 && finished.length === 0)) {
      return next(e)
    }
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const shown = running.slice(0, MAX_ROWS)
    const hidden = running.length - shown.length
    const lines = [...shown.map(runningLine), ...finished.map(finishedLine)]
    const widths = columnWidths(lines)
    const drawLine = (one: ExperimentLine) => (
      <Box key={one.key}>
        <Text>
          <Text color="cyan">Bitfab</Text>{" "}
          {one.statusColor === null ? (
            <Text dimColor>{`[${one.status}]`.padEnd(widths.status + 2)}</Text>
          ) : (
            <Text color={one.statusColor}>
              {`[${one.status}]`.padEnd(widths.status + 2)}
            </Text>
          )}
          <Text dimColor>{one.count}</Text>
          {one.errored.length > 0 && <Text dimColor>{ERRORED_SEPARATOR}</Text>}
          {one.errored.length > 0 && (
            <Text color="red">
              {one.errored.slice(ERRORED_SEPARATOR.length)}
            </Text>
          )}
          {widths.count === 0
            ? ""
            : " ".repeat(
                widths.count - one.count.length - one.errored.length + 2,
              )}
          {one.label.padEnd(widths.label + 2)}
        </Text>
        <Link href={one.url} label="open" />
        {one.clearable && <Text> </Text>}
        {one.clearable && (
          <Button
            key={`clear-${one.id}`}
            label="x"
            onPress={() => clearFinished($, [one.id])}
          />
        )}
      </Box>
    )
    return (
      <Box flexDirection="column">
        {lines.slice(0, shown.length).map(drawLine)}
        {hidden > 0 && <Text dimColor>{hidden} more running</Text>}
        {lines.slice(shown.length).map(drawLine)}
        {finished.length > 0 && (
          <Box>
            {finished.length > 1 && (
              <Button
                key="clear-finished"
                label="Clear all"
                onPress={() => clearFinished($, null)}
              />
            )}
            {e.surface === "terminal" && (
              <Text dimColor>
                {finished.length > 1 ? "  " : ""}
                {SELECT_HINT}
              </Text>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
