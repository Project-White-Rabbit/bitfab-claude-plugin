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

function experimentLabel(experiment: { id: string; name: string | null }) {
  return experiment.name ?? `Experiment ${experiment.id.slice(0, 8)}`
}

function progressLabel(experiment: RunningExperiment) {
  return experiment.total === null
    ? `${experiment.finished} replayed`
    : `${experiment.finished}/${experiment.total} replayed`
}

function runningLabel(experiment: RunningExperiment) {
  if (!experiment.stalled) {
    return progressLabel(experiment)
  }
  return experiment.total === null
    ? `stalled ${experiment.finished}`
    : `stalled ${experiment.finished}/${experiment.total}`
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

function statusTag(status: string, width: number) {
  return `[${status}]`.padEnd(width + 2)
}

function outcomeColor(experiment: FinishedExperiment) {
  return experiment.status === "completed" ? "green" : "red"
}

function outcomeLabel(experiment: FinishedExperiment) {
  return experiment.status === "completed" ? "finished" : experiment.status
}

function finishLabel(experiment: FinishedExperiment) {
  return `${experimentLabel(experiment)} ${outcomeLabel(experiment)}`
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
  await update($, finishedExperiments, (kept) =>
    [...[...fresh].reverse(), ...kept].slice(0, MAX_FINISHED_KEPT),
  )
  for (const experiment of fresh) {
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
    const statusWidth = Math.max(
      ...shown.map((experiment) => runningLabel(experiment).length),
      ...finished.map((experiment) => outcomeLabel(experiment).length),
    )
    return (
      <Box flexDirection="column">
        {shown.map((experiment) => (
          <Box key={experiment.id}>
            <Text>
              {experiment.stalled ? (
                <Text color="yellow">
                  {statusTag(runningLabel(experiment), statusWidth)}
                </Text>
              ) : (
                <Text dimColor>
                  {statusTag(runningLabel(experiment), statusWidth)}
                </Text>
              )}{" "}
              <Text color="cyan">Bitfab</Text> {experimentLabel(
                experiment,
              )}{" "}
            </Text>
            <Link href={experiment.url} label="open" />
          </Box>
        ))}
        {hidden > 0 && <Text dimColor>{hidden} more running</Text>}
        {finished.map((experiment) => (
          <Box key={`finished-${experiment.id}`}>
            <Text>
              <Text color={outcomeColor(experiment)}>
                {statusTag(outcomeLabel(experiment), statusWidth)}
              </Text>{" "}
              <Text color="cyan">Bitfab</Text> {experimentLabel(
                experiment,
              )}{" "}
            </Text>
            <Link href={experiment.url} label="open" />
            <Text> </Text>
            <Button
              key={`clear-${experiment.id}`}
              label="x"
              onPress={() =>
                update($, finishedExperiments, (kept) =>
                  kept.filter((one) => one.id !== experiment.id),
                )
              }
            />
          </Box>
        ))}
        {finished.length > 0 && (
          <Box>
            {finished.length > 1 && (
              <Button
                key="clear-finished"
                label="Clear all"
                onPress={() => update($, finishedExperiments, () => [])}
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
