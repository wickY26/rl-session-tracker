import { MODES, STAT_KEYS, type NewMatch } from './types'

/** Problems that block saving a match. Empty when it can be saved. */
export function matchErrors(m: NewMatch): string[] {
  const errors: string[] = []
  const size = MODES.indexOf(m.mode) + 1
  if (m.teams.some((t) => t.players.length !== size)) errors.push(`Both teams need ${size} player(s) for ${m.mode}`)
  if (m.winner !== 0 && m.winner !== 1) errors.push('Pick the winning team')
  const me = m.teams[m.me.team]?.players[m.me.index]
  if (!me) errors.push('Mark which row is you')
  else if (me.mmr === null || me.mmrDelta === null) errors.push('Your MMR and its change are required')
  for (const team of m.teams)
    for (const p of team.players) {
      if (!p.name.trim()) errors.push('Every player needs a name')
      for (const key of STAT_KEYS) {
        if (!Number.isInteger(p[key]) || p[key] < 0) errors.push(`${p.name || '?'}: ${key} must be a whole number`)
      }
    }
  return [...new Set(errors)]
}
