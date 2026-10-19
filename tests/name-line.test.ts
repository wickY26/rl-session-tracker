import { describe, expect, it } from 'vitest'
import { isCasual, parseNameLine } from '../src/ocr/name-line'
import { findAccount } from '../src/ocr/names'

describe('parseNameLine', () => {
  it.each([
    ['[CLUB] [905 + 9] player_one', 'player_one', 905, 9],
    ['[905 + 9] teammate_two', 'teammate_two', 905, 9],
    ['[ABC] [909 - 9] rival27', 'rival27', 909, -9],
    ['[XYZ] [895 - 17] rival_four', 'rival_four', 895, -17],
    ['[XYZ] [895 — 17] rival_four', 'rival_four', 895, -17],
    ['[9Ø5 + 9] player_one', 'player_one', 905, 9],
    ['[CLUB][905+9]player_one', 'player_one', 905, 9],
    ['[CLUB] (905 + 9] player_one', 'player_one', 905, 9],
    ['[1512 + 11] SomeOne', 'SomeOne', 1512, 11],
    // OCR slips seen on real scoreboards: '[' read as '1[', Ø as '@', trailing icon junk
    ['+ 1[9@5 + 9] teammate_two @', 'teammate_two', 905, 9],
    ['| | [CLUB] [905 + 9] playerOneB3', 'playerOneB3', 905, 9],
    ['[ABC][9@9 - 9] rival27', 'rival27', 909, -9]
  ])('%s', (line, name, mmr, delta) => {
    expect(parseNameLine(line)).toMatchObject({ name, mmr, mmrDelta: delta })
  })

  it('keeps club tags apart from the name', () => {
    expect(parseNameLine('[CLUB] [905 + 9] player_one').tags).toEqual(['CLUB'])
  })

  it('casual lines have tags and name but no MMR', () => {
    expect(parseNameLine('[BACK] wickY26')).toEqual({ name: 'wickY26', mmr: null, mmrDelta: null, tags: ['BACK'] })
    expect(parseNameLine('[PS] ZeNoThEoMnIGoD')).toMatchObject({ name: 'ZeNoThEoMnIGoD', mmr: null })
    expect(parseNameLine('proste_cenda')).toMatchObject({ name: 'proste_cenda', mmr: null })
  })

  it('strips icon junk before the name', () => {
    expect(parseNameLine('& [PS] ZeNoThEoMnIGoD')).toMatchObject({ name: 'ZeNoThEoMnIGoD' })
    expect(parseNameLine('@ proste_cenda')).toMatchObject({ name: 'proste_cenda' })
  })

  it('does not take title lines or tag-like brackets for MMR', () => {
    expect(parseNameLine('S24 WINS: 215').mmr).toBeNull()
    expect(parseNameLine('FORK IN THE ROAD').mmr).toBeNull()
    expect(parseNameLine('[OO-O] Ollie-1').mmr).toBeNull()
  })

  it('skips a tag-like bracket and still finds the MMR after it', () => {
    expect(parseNameLine('[OO-O] [905 + 9] player_one')).toMatchObject({ name: 'player_one', mmr: 905, mmrDelta: 9 })
  })
})

describe('isCasual', () => {
  it('is casual only when nobody has MMR', () => {
    expect(isCasual([{ mmr: null }, { mmr: null }])).toBe(true)
    expect(isCasual([{ mmr: null }, { mmr: 905 }])).toBe(false)
  })
})

describe('findAccount', () => {
  const names = ['teammate_two', 'player_one', 'rival27', 'rival_four']
  it('finds the account by fuzzy name', () => {
    expect(findAccount(names, 'player_one')).toBe(1)
    expect(findAccount(['teammate_two', 'player_0ne'], 'player_one')).toBe(1)
    expect(findAccount(names, 'PLAYER_ONE')).toBe(1)
  })
  it('returns -1 when the account is not on the scoreboard', () => {
    expect(findAccount(names, 'wickY26')).toBe(-1)
  })
})
