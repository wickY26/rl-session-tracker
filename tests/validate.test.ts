import { describe, expect, it } from 'vitest'
import { matchErrors, missingFields, needsReview } from '../src/core/validate'
import { match, player } from './helpers'

describe('matchErrors — only "who am I" and "who won" block saving', () => {
  it('accepts a complete match', () => {
    expect(matchErrors(match({}))).toEqual([])
  })

  it('saves with my MMR, names and stats empty', () => {
    const m = match({ mmr: null, delta: null, me: { score: null, goals: null }, mates: [player('', { saves: null })] })
    expect(matchErrors(m)).toEqual([])
  })

  it('still rejects values that are filled in but make no sense', () => {
    const m = match({ mates: [player('mate', { saves: 1.5 })] })
    expect(matchErrors(m).some((e) => e.includes('saves'))).toBe(true)
  })

  it('requires team sizes to match the mode', () => {
    const m = match({ mode: '3v3' })
    m.teams[1].players.pop()
    expect(matchErrors(m)).toContain('Both teams need 3 player(s) for 3v3')
  })
})

describe('missingFields', () => {
  it('lists empty values, mine first', () => {
    const m = match({ mmr: 900, delta: null, mates: [player('', { goals: null })] })
    for (const p of m.teams[1].players) [p.mmr, p.mmrDelta] = [1000, -9]
    expect(missingFields(m)).toEqual([
      { mine: true, label: 'Your MMR change' },
      { mine: false, label: 'Unreadable player name' },
      { mine: false, label: 'Unknown player: MMR' },
      { mine: false, label: 'Unknown player: MMR change' },
      { mine: false, label: 'Unknown player: goals' }
    ])
  })

  it('a fully read match needs no review', () => {
    const m = match({})
    for (const t of m.teams) for (const p of t.players) [p.mmr, p.mmrDelta] = [1000, 9]
    expect(needsReview(m)).toBe(false)
  })
})
