import { describe, expect, it } from 'vitest'
import { addMatch, emptyData } from '../src/core/sessions'
import { currentStreak, mmrSeries, modeOverview, modeSummary, sessionSummaries } from '../src/core/stats'
import type { Match, NewMatch, TrackerData } from '../src/core/types'
import { at, ids, match, player } from './helpers'

const IDLE = 120

function save(inputs: NewMatch[], startMinute = 0, data: TrackerData = emptyData()): TrackerData {
  const newId = ids(`m${startMinute}-`)
  inputs.forEach((input, i) => {
    data = addMatch(data, input, at(startMinute + i * 10), IDLE, newId).data
  })
  return data
}

describe('session summaries', () => {
  // 2v2: 905 → 914 (W +9) → 896 (L -18) → 906 (W +10) ; 3v3: 700 → 692 (L -8)
  const matches: Match[] = save([
    match({ mode: '2v2', win: true, mmr: 914, delta: 9, me: { score: 400, goals: 2 } }),
    match({ mode: '3v3', win: false, mmr: 692, delta: -8, me: { score: 200, goals: 0 } }),
    match({ mode: '2v2', win: false, mmr: 896, delta: -18, me: { score: 250, goals: 0 } }),
    match({ mode: '2v2', win: true, mmr: 906, delta: 10, me: { score: 550, goals: 1 } })
  ]).matches

  it('gives one summary per mode played, in mode order', () => {
    expect(sessionSummaries(matches).map((s) => s.mode)).toEqual(['2v2', '3v3'])
  })

  it('2v2 numbers match a hand calculation', () => {
    const s = modeSummary(matches, '2v2')
    expect(s).toMatchObject({ matches: 3, wins: 2, losses: 1, mmrStart: 905, mmrEnd: 906, mmrDelta: 1 })
    expect(s.winRate).toBeCloseTo(2 / 3)
    expect(s.averages.score).toBeCloseTo((400 + 250 + 550) / 3)
    expect(s.averages.goals).toBeCloseTo(1)
    expect(s.streak).toEqual({ kind: 'W', count: 1 })
  })

  it('3v3 is never mixed into 2v2', () => {
    expect(modeSummary(matches, '3v3')).toMatchObject({ matches: 1, wins: 0, losses: 1, mmrStart: 700, mmrEnd: 692, mmrDelta: -8 })
  })

  it('skips unreadable MMR instead of counting it as 0', () => {
    const data = save([
      match({ mmr: 914, delta: 9 }),
      match({ mmr: null, delta: null }),
      match({ mmr: 932, delta: 9 })
    ])
    expect(modeSummary(data.matches, '2v2')).toMatchObject({ mmrStart: 905, mmrEnd: 932, mmrDelta: 18 })
  })

  it('counts MVPs only for wins where I had the top score on my team', () => {
    const data = save([
      match({ win: true, me: { score: 600 }, mates: [player('mate', { score: 300 })] }),
      match({ win: true, me: { score: 200 }, mates: [player('mate', { score: 300 })] }),
      match({ win: false, me: { score: 900 }, mates: [player('mate', { score: 300 })] })
    ])
    expect(modeSummary(data.matches, '2v2').mvps).toBe(1)
  })
})

describe('streaks', () => {
  it('counts back from the latest match', () => {
    const data = save([match({ win: true }), match({ win: false }), match({ win: false }), match({ win: false })])
    expect(currentStreak(data.matches)).toEqual({ kind: 'L', count: 3 })
    expect(currentStreak([])).toBeNull()
  })
})

describe('MMR series', () => {
  it('has one point per rated match and marks session boundaries', () => {
    let data = save([match({ mmr: 914 }), match({ mmr: null, delta: null }), match({ mmr: 923 })])
    data = save([match({ mmr: 932 }), match({ mode: '3v3', mmr: 700 })], 300, data)
    const series = mmrSeries(data.matches, '2v2')
    expect(series.map((p) => p.mmr)).toEqual([914, 923, 932])
    expect(series.map((p) => p.sessionStart)).toEqual([true, false, true])
    expect(mmrSeries(data.matches, '3v3').map((p) => p.mmr)).toEqual([700])
  })

  it('puts the configured starting MMR first', () => {
    const data = save([match({ mmr: 914 })])
    expect(mmrSeries(data.matches, '2v2', 880).map((p) => p.mmr)).toEqual([880, 914])
    expect(mmrSeries(data.matches, '1v1', 880)).toEqual([])
  })
})

describe('mode overview', () => {
  it('reports current and peak MMR per mode', () => {
    const data = save([match({ mmr: 914 }), match({ mmr: 950 }), match({ mmr: 931, win: false, delta: -19 })])
    expect(modeOverview(data.matches, '2v2')).toMatchObject({ current: 931, peak: 950, matches: 3, wins: 2, losses: 1 })
    expect(modeOverview(data.matches, '1v1')).toMatchObject({ current: null, peak: null, matches: 0 })
  })
})
