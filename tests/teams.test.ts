import { describe, expect, it } from 'vitest'
import { addMatch, deleteMatch, emptyData } from '../src/core/sessions'
import { deriveTeams, findDuplicate, knownTeammates, setTeamTracked, snapTeammateName, teamKey } from '../src/core/teams'
import type { NewMatch, TrackerData } from '../src/core/types'
import { at, ids, match, player } from './helpers'

function save(inputs: NewMatch[]): TrackerData {
  const newId = ids()
  let data = emptyData()
  inputs.forEach((input, i) => {
    data = addMatch(data, input, at(i * 10), 120, newId).data
  })
  return data
}

const friend = (name = 'ZeNoThEoMnIGoD', over = {}) => player(name, { party: true, ...over })

describe('team key', () => {
  it('2v2 with a party teammate forms a team', () => {
    expect(teamKey(match({ mates: [friend()] }))).toBe('2v2:zenotheomnigod')
  })

  it('3v3 with one random teammate does not', () => {
    expect(teamKey(match({ mode: '3v3', mates: [friend(), player('random')] }))).toBeNull()
  })

  it('3v3 with two party teammates forms a team regardless of row order', () => {
    const a = teamKey(match({ mode: '3v3', mates: [friend('b_friend'), friend('A_friend')] }))
    const b = teamKey(match({ mode: '3v3', mates: [friend('a_friend'), friend('B_friend')] }))
    expect(a).toBe('3v3:a_friend+b_friend')
    expect(b).toBe(a)
  })

  it('1v1 never forms a team; opponents party icons are ignored', () => {
    expect(teamKey(match({ mode: '1v1' }))).toBeNull()
    const m = match({ mates: [player('random')] })
    m.teams[1].players.forEach((p) => (p.party = true))
    expect(teamKey(m)).toBeNull()
  })
})

describe('deriveTeams', () => {
  const data = save([
    match({ mates: [friend('friendX', { score: 500 })], win: true, delta: 9, me: { score: 300 } }),
    match({ mates: [player('random')] }),
    match({ mates: [friend('friendX', { score: 300 })], win: false, delta: -12, me: { score: 100 } }),
    match({ mode: '3v3', mates: [friend('friendX'), friend('friendY')] })
  ])

  it('groups matches per lineup, most played first', () => {
    const teams = deriveTeams(data)
    expect(teams.map((t) => t.key)).toEqual(['2v2:friendx', '3v3:friendx+friendy'])
    expect(teams[0]).toMatchObject({ matches: 2, wins: 1, losses: 1, winRate: 0.5, mmrDelta: -3, members: ['friendX'] })
    expect(teams[0].myAverages.score).toBe(200)
    expect(teams[0].teammates[0]).toMatchObject({ name: 'friendX' })
    expect(teams[0].teammates[0].averages.score).toBe(400)
  })

  it('untracking hides nothing from the data and can be undone', () => {
    const hidden = setTeamTracked(data, '2v2:friendx', false)
    expect(deriveTeams(hidden).find((t) => t.key === '2v2:friendx')!.tracked).toBe(false)
    expect(hidden.matches).toBe(data.matches)
    const back = setTeamTracked(hidden, '2v2:friendx', true)
    expect(deriveTeams(back).every((t) => t.tracked)).toBe(true)
    expect(back.untrackedTeams).toEqual([])
  })

  it('a team disappears when its matches are deleted', () => {
    const threeV3 = data.matches[3]
    expect(deriveTeams(deleteMatch(data, threeV3.id)).map((t) => t.key)).toEqual(['2v2:friendx'])
  })
})

describe('teammate name snapping', () => {
  const known = ['ZeNoThEoMnIGoD', 'wicky26', 'proste_cenda']

  it('snaps OCR-confusable variants to the known name', () => {
    expect(snapTeammateName('ZeNoThEoMnIG0D', known)).toBe('ZeNoThEoMnIGoD')
    expect(snapTeammateName('zenotheomnigod', known)).toBe('ZeNoThEoMnIGoD')
    expect(snapTeammateName('wlcky26', known)).toBe('wicky26')
  })

  it('allows one dropped character only for long names', () => {
    expect(snapTeammateName('ZeNoThEoMnIGD', known)).toBe('ZeNoThEoMnIGoD')
    expect(snapTeammateName('proste_cend', known)).toBe('proste_cenda')
  })

  it('does not snap genuinely different short names', () => {
    expect(snapTeammateName('wicky27', known)).toBe('wicky27')
    expect(snapTeammateName('newfriend', known)).toBe('newfriend')
  })

  it('knownTeammates lists party teammates only, latest spelling first', () => {
    const data = save([
      match({ mates: [friend('FriendX')] }),
      match({ mates: [player('random')] }),
      match({ mates: [friend('friendx')] })
    ])
    expect(knownTeammates(data.matches)).toEqual(['friendx'])
  })
})

describe('duplicate detection', () => {
  it('finds the same scoreboard saved twice', () => {
    const input = match({ mates: [friend()] })
    const data = save([input])
    expect(findDuplicate(data.matches, structuredClone(input))).toBe(data.matches[0])
  })

  it('a different stat line is not a duplicate', () => {
    const input = match({ mates: [friend()] })
    const data = save([input])
    const other = structuredClone(input)
    other.teams[0].players[0].saves += 1
    expect(findDuplicate(data.matches, other)).toBeNull()
  })
})
