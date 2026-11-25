export type Usage = {
  /** Input tokens of the last response; absent before the first one. */
  tokens?: number
  /** The model's context window in tokens. */
  window: number
  /** tokens / window, 0 to 100; absent before the first response. */
  percent?: number
  /** Where auto-compaction runs, in tokens; absent when it is off or unknown. */
  compactAt?: number
}

/** One rate-limit window, as the status line has it. */
export type Limit = {
  /** `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
  kind: string
  /** 0 to 100. */
  percentUsed: number
  /** ISO 8601. */
  resetsAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'm3-context': { usage: Usage | null; limits: Limit[] }
  }
}
