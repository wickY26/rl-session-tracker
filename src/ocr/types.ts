import type { Mode, PlayerRef, StatKey } from '../core/types'

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Word {
  text: string
  box: Box
  confidence: number
}

export type TeamColor = 'orange' | 'blue'

export interface ReadingPlayer {
  /** OCR text of the name line, for the confirm card and debugging. */
  rawLine: string
  /** Name without club tags / MMR bracket; '' when unreadable. */
  name: string
  mmr: number | null
  mmrDelta: number | null
  party: boolean
  stats: Record<StatKey, number | null>
}

export interface ReadingTeam {
  color: TeamColor | null
  /** Sum of player goals (the big stylized team score isn't OCR-friendly). */
  goals: number | null
  players: ReadingPlayer[]
}

export interface ScoreboardReading {
  teams: [ReadingTeam, ReadingTeam]
  /** Rows per team; null when the two teams disagree and it can't be decided. */
  mode: Mode | null
  winner: 0 | 1 | null
  /** No player shows an `[MMR ± change]` bracket → casual match, not saved. */
  casual: boolean
  /** Row of the configured account; null when not found. */
  me: PlayerRef | null
  /** Set when reading failed entirely (no scoreboard found…). */
  fatal: string | null
  warnings: string[]
}
