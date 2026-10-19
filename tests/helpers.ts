import type { Mode, NewMatch, PlayerLine } from '../src/core/types'
import { DEFAULT_PLAYLIST } from '../src/core/types'

export function player(name: string, over: Partial<PlayerLine> = {}): PlayerLine {
  return { name, mmr: null, mmrDelta: null, party: false, score: 300, goals: 1, assists: 0, saves: 1, shots: 2, ...over }
}

let opponentCounter = 0

/**
 * Builds a match from my side's view: `me` plus teammates on team 0, random opponents on team 1.
 * `win` decides the winner; my MMR line is `[mmr ± delta]`.
 */
export function match(opts: {
  mode?: Mode
  win?: boolean
  mmr?: number | null
  delta?: number | null
  me?: Partial<PlayerLine>
  mates?: PlayerLine[]
}): NewMatch {
  const mode = opts.mode ?? '2v2'
  const size = Number(mode[0])
  const win = opts.win ?? true
  const delta = opts.delta === undefined ? (win ? 9 : -9) : opts.delta
  const me = player('wickY26', { mmr: opts.mmr === undefined ? 900 : opts.mmr, mmrDelta: delta, ...opts.me })
  const mates = opts.mates ?? Array.from({ length: size - 1 }, (_, i) => player(`random${i}`))
  const opponents = Array.from({ length: size }, () => player(`opp${opponentCounter++}`))
  return {
    mode,
    playlist: DEFAULT_PLAYLIST[mode],
    teams: [
      { goals: win ? 3 : 1, players: [me, ...mates] },
      { goals: win ? 1 : 3, players: opponents }
    ],
    winner: win ? 0 : 1,
    me: { team: 0, index: 0 },
    screenshot: null
  }
}

export function ids(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}

/** Minutes after a fixed base time. */
export function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 19, 18, 0) + minutes * 60_000)
}
