import { MODES, STAT_KEYS, type NewMatch } from './types'

/**
 * Problems that block saving a match. Only what the screenshot nearly always gives is required —
 * which row is you and who won — so saving never stops a session for typing. Everything else may be
 * empty and is listed by `missingFields` for later review. Values that are filled in must make sense.
 */
export function matchErrors(m: NewMatch): string[] {
  const errors: string[] = []
  const size = MODES.indexOf(m.mode) + 1
  if (m.teams.some((t) => t.players.length !== size)) errors.push(`Both teams need ${size} player(s) for ${m.mode}`)
  if (m.winner !== 0 && m.winner !== 1) errors.push('Pick the winning team')
  if (!m.teams[m.me.team]?.players[m.me.index]) errors.push('Mark which row is you')
  for (const team of m.teams)
    for (const p of team.players)
      for (const key of STAT_KEYS) {
        const v = p[key]
        if (v !== null && (!Number.isInteger(v) || v < 0)) errors.push(`${p.name || '?'}: ${key} must be a whole number`)
      }
  return [...new Set(errors)]
}

/** One value that couldn't be read and was saved empty. */
export interface MissingField {
  /** Whose value: my own (worth fixing) or another player's (nice to have). */
  mine: boolean
  label: string
}

/** Empty values of a saved (or about to be saved) match, mine first. */
export function missingFields(m: NewMatch): MissingField[] {
  const out: MissingField[] = []
  m.teams.forEach((team, ti) =>
    team.players.forEach((p, pi) => {
      const mine = ti === m.me.team && pi === m.me.index
      const who = mine ? 'Your' : `${p.name.trim() || 'Unknown player'}:`
      if (!mine && !p.name.trim()) out.push({ mine, label: 'Unreadable player name' })
      if (p.mmr === null) out.push({ mine, label: `${who} MMR` })
      if (p.mmrDelta === null) out.push({ mine, label: `${who} MMR change` })
      for (const key of STAT_KEYS) if (p[key] === null) out.push({ mine, label: `${who} ${key}` })
    })
  )
  return out.sort((a, b) => Number(b.mine) - Number(a.mine))
}

/** A saved match with any empty value; shown with a "Needs review" badge. */
export function needsReview(m: NewMatch): boolean {
  return missingFields(m).length > 0
}
