import { describe, expect, it } from 'vitest'
import { matchErrors } from '../src/core/validate'
import { match, player } from './helpers'

describe('matchErrors', () => {
  it('accepts a complete match', () => {
    expect(matchErrors(match({}))).toEqual([])
  })

  it('requires my MMR and change', () => {
    expect(matchErrors(match({ mmr: null }))).toContain('Your MMR and its change are required')
  })

  it('requires names and whole-number stats', () => {
    const m = match({ mates: [player('', { saves: 1.5 })] })
    const errors = matchErrors(m)
    expect(errors).toContain('Every player needs a name')
    expect(errors.some((e) => e.includes('saves'))).toBe(true)
  })

  it('requires team sizes to match the mode', () => {
    const m = match({ mode: '3v3' })
    m.teams[1].players.pop()
    expect(matchErrors(m)).toContain('Both teams need 3 player(s) for 3v3')
  })
})
