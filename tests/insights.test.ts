import { describe, expect, it } from 'vitest'
import { compare, matchChips, matchInsight } from '../src/core/insights'
import { addMatch, emptyData } from '../src/core/sessions'
import type { Match, NewMatch } from '../src/core/types'
import { at, ids, match, player } from './helpers'

function saved(inputs: NewMatch[]): Match[] {
  const newId = ids()
  let data = emptyData()
  inputs.forEach((input, i) => {
    data = addMatch(data, input, at(i * 10), 120, newId).data
  })
  return data.matches
}

/** 2v2 where I score `myScore`, my mate 200, opponents 300 and 100, with given team MMRs. */
function lobby(opts: { win: boolean; myScore: number; myMmr?: number; mateMmr?: number; oppMmr?: number; goals?: number; saves?: number }): NewMatch {
  const m = match({
    win: opts.win,
    mmr: opts.myMmr ?? 1000,
    me: { score: opts.myScore, goals: opts.goals ?? 1, saves: opts.saves ?? 1 },
    mates: [player('mate', { score: 200, mmr: opts.mateMmr ?? 1000 })]
  })
  m.teams[1].players = [player('o1', { score: 300, mmr: opts.oppMmr ?? 1000 }), player('o2', { score: 100, mmr: opts.oppMmr ?? 1000 })]
  return m
}

describe('matchInsight', () => {
  it('ranks my score in the lobby and my share of the team score', () => {
    const [m] = saved([lobby({ win: true, myScore: 600 })])
    expect(matchInsight(m)).toMatchObject({ lobbyRank: 1, lobbySize: 4, scoreShare: 0.75, mmrGap: 0 })
  })

  it('positive MMR gap means the opponents were rated higher', () => {
    const [m] = saved([lobby({ win: true, myScore: 250, oppMmr: 1060 })])
    expect(matchInsight(m)).toMatchObject({ lobbyRank: 2, mmrGap: 60 })
  })

  it('skips unreadable MMRs in the averages', () => {
    const [m] = saved([lobby({ win: true, myScore: 250, mateMmr: undefined })])
    m.teams[0].players[1].mmr = null
    expect(matchInsight(m).myTeamMmr).toBe(1000)
  })
})

describe('matchChips', () => {
  it('MVP, underdog win and carry', () => {
    const [m] = saved([lobby({ win: true, myScore: 600, oppMmr: 1050 })])
    expect(matchChips(m).map((c) => c.label)).toEqual(['MVP', 'Underdog win +50', 'Carried 75%'])
  })

  it('top score in a loss, upset loss', () => {
    const [m] = saved([lobby({ win: false, myScore: 600, oppMmr: 950 })])
    expect(matchChips(m).map((c) => c.label)).toEqual(['Top score in lobby', 'Upset loss -50', 'Carried 75%'])
  })

  it('at most three chips', () => {
    const [m] = saved([lobby({ win: true, myScore: 600, oppMmr: 1050, goals: 3, saves: 5 })])
    expect(matchChips(m)).toHaveLength(3)
  })

  it('nothing special, no chips', () => {
    const [m] = saved([lobby({ win: false, myScore: 150 })])
    expect(matchChips(m)).toEqual([])
  })
})

describe('compare', () => {
  it('averages me, teammates and opponents over the same matches', () => {
    const c = compare(saved([lobby({ win: true, myScore: 600 }), lobby({ win: false, myScore: 200, oppMmr: 1100 })]))!
    expect(c.me.score).toBe(400)
    expect(c.teammates!.score).toBe(200)
    expect(c.opponents.score).toBe(200)
    expect(c.opponentMmr).toBe(1050)
    expect(c.avgLobbyRank).toBe(1.5)
    expect(c.lobbySize).toBe(4)
  })

  it('1v1 has no teammates', () => {
    expect(compare(saved([match({ mode: '1v1' })]))!.teammates).toBeNull()
    expect(compare([])).toBeNull()
  })
})
