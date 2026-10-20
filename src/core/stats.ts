import { MODES, STAT_KEYS, type Match, type Mode, type PlayerLine, type StatLine, type Stats, type TeamResult } from './types'

export function myLine(m: Match): PlayerLine {
  return m.teams[m.me.team].players[m.me.index]
}

export function myTeam(m: Match): TeamResult {
  return m.teams[m.me.team]
}

export function isWin(m: Match): boolean {
  return m.winner === m.me.team
}

/** MMR before the match: shown MMR minus the change (shown value is the one after the match — see SPEC open question 1). */
export function mmrBefore(line: PlayerLine): number | null {
  return line.mmr !== null && line.mmrDelta !== null ? line.mmr - line.mmrDelta : null
}

/** MVP = highest score on the winning team. */
export function isMvp(m: Match): boolean {
  const mine = myLine(m).score
  if (!isWin(m) || mine === null) return false
  return myTeam(m).players.every((p) => p.score === null || p.score <= mine)
}

export function ofMode(matches: readonly Match[], mode: Mode): Match[] {
  return matches.filter((m) => m.mode === mode)
}

/** Modes that appear in the matches, in 1v1 → 3v3 order. */
export function modesPlayed(matches: readonly Match[]): Mode[] {
  return MODES.filter((mode) => matches.some((m) => m.mode === mode))
}

export interface Streak {
  kind: 'W' | 'L'
  count: number
}

/** Consecutive wins or losses ending at the latest match (matches in chronological order). */
export function currentStreak(matches: readonly Match[]): Streak | null {
  if (!matches.length) return null
  const kind = isWin(matches[matches.length - 1]) ? 'W' : 'L'
  let count = 0
  for (let i = matches.length - 1; i >= 0 && (isWin(matches[i]) ? 'W' : 'L') === kind; i--) count++
  return { kind, count }
}

/** Per-stat averages over the values that were read; unreadable cells are left out, not counted as 0. */
export function averages(lines: readonly StatLine[]): Stats {
  const out = {} as Stats
  for (const key of STAT_KEYS) {
    const values = lines.map((l) => l[key]).filter((v): v is number => v !== null)
    out[key] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
  }
  return out
}

export interface ModeSummary {
  mode: Mode
  matches: number
  wins: number
  losses: number
  winRate: number
  /** My MMR before the first match with a readable MMR. */
  mmrStart: number | null
  /** My MMR after the last match with a readable MMR. */
  mmrEnd: number | null
  /** Sum of my readable MMR changes; unreadable ones are skipped, not counted as 0. */
  mmrDelta: number
  streak: Streak | null
  averages: Stats
  mvps: number
}

/** Summary of one mode over the given matches (a session, a team, all time…). */
export function modeSummary(all: readonly Match[], mode: Mode): ModeSummary {
  const matches = ofMode(all, mode)
  const wins = matches.filter(isWin).length
  const lines = matches.map(myLine)
  const rated = lines.filter((l) => l.mmr !== null)
  const first = rated[0]
  return {
    mode,
    matches: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: matches.length ? wins / matches.length : 0,
    mmrStart: first ? (mmrBefore(first) ?? first.mmr) : null,
    mmrEnd: rated.length ? rated[rated.length - 1].mmr : null,
    mmrDelta: lines.reduce((s, l) => s + (l.mmrDelta ?? 0), 0),
    streak: currentStreak(matches),
    averages: averages(lines),
    mvps: matches.filter(isMvp).length
  }
}

/** One summary per mode played in the session — MMR is never mixed across modes. */
export function sessionSummaries(matches: readonly Match[]): ModeSummary[] {
  return modesPlayed(matches).map((mode) => modeSummary(matches, mode))
}

export interface MmrPoint {
  matchId: string | null
  at: string
  mmr: number
  sessionId: string | null
  /** First point of a new session (chart draws a boundary). */
  sessionStart: boolean
}

/**
 * My MMR over time for one mode, one point per match with a readable MMR.
 * The configured starting MMR, if any, is the first point.
 */
export function mmrSeries(all: readonly Match[], mode: Mode, startingMmr?: number): MmrPoint[] {
  const points: MmrPoint[] = []
  const matches = ofMode(all, mode)
  if (startingMmr !== undefined && matches.length) {
    points.push({ matchId: null, at: matches[0].recordedAt, mmr: startingMmr, sessionId: null, sessionStart: false })
  }
  let lastSession: string | null = null
  for (const m of matches) {
    const mmr = myLine(m).mmr
    if (mmr === null) continue
    points.push({ matchId: m.id, at: m.recordedAt, mmr, sessionId: m.sessionId, sessionStart: m.sessionId !== lastSession })
    lastSession = m.sessionId
  }
  return points
}

export interface ModeOverview {
  mode: Mode
  current: number | null
  peak: number | null
  matches: number
  wins: number
  losses: number
  winRate: number
}

/** All-time card for the dashboard. */
export function modeOverview(all: readonly Match[], mode: Mode): ModeOverview {
  const summary = modeSummary(all, mode)
  const values = ofMode(all, mode)
    .map((m) => myLine(m).mmr)
    .filter((v): v is number => v !== null)
  return {
    mode,
    current: summary.mmrEnd,
    peak: values.length ? Math.max(...values) : null,
    matches: summary.matches,
    wins: summary.wins,
    losses: summary.losses,
    winRate: summary.winRate
  }
}
