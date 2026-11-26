export type RunningExperiment = {
  id: string
  name: string | null
  finished: number
  total: number | null
  url: string
  stalled: boolean
}

export type FinishedExperiment = {
  id: string
  name: string | null
  status: string
  url: string
  announce?: boolean
  errored?: number | null
  total?: number | null
}

export type ExperimentSnapshot = {
  running: RunningExperiment[]
  finished: FinishedExperiment[]
}

declare module "claude-code" {
  interface PluginState {
    bitfab: {
      runningExperiments: RunningExperiment[]
      finishedExperiments: FinishedExperiment[]
      announcedExperimentIds: string[]
      stalledExperimentIds: string[]
    }
  }
}
