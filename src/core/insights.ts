import { averages, isMvp, isWin, myLine, myTeam } from './stats'
import { teammates } from './teams'
import type { Match, PlayerLine, Stats } from './types'

/** Mean of the readable MMRs, or null when none is readable. */
function avgMmr(lines: readonly PlayerLine[]): number | null {
  const values = lines.map((l) => l.mmr).filter((v): v is number => v !== null)
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

export function opponents(m: Match): PlayerLine[] {
  return m.teams[m.me.team === 0 ? 1 : 0].players
}

export interface MatchInsight {
  /** 1 = highest score of everyone in the match. */
  lobbyRank: number
  lobbySize: number
  /** My share of my team's total score (0..1). */
  scoreShare: number
  myTeamMmr: number | null
  opponentMmr: number | null
  /** Opponents' average MMR minus my team's: positive = I was the underdog. */
  mmrGap: number | null
}

export function matchInsight(m: Match): MatchInsight {
  const me = myLine(m)
  const everyone = m.teams.flatMap((t) => t.players)
  const teamScore = myTeam(m).players.reduce((s, p) => s + p.score, 0)
  const myTeamMmr = avgMmr(myTeam(m).players)
  const opponentMmr = avgMmr(opponents(m))
  return {
    lobbyRank: 1 + everyone.filter((p) => p.score > me.score).length,
    lobbySize: everyone.length,
    scoreShare: teamScore ? me.score / teamScore : 0,
    myTeamMmr,
    opponentMmr,
    mmrGap: myTeamMmr !== null && opponentMmr !== null ? Math.round(opponentMmr - myTeamMmr) : null
  }
}

export type ChipTone = 'gold' | 'pos' | 'neg' | 'info'

export interface Chip {
  label: string
  tone: ChipTone
  /** Longer explanation for the tooltip. */
  title: string
}

/** Rating difference that counts as a clear favourite / underdog. */
const GAP = 25

/** Up to three highlights of one match, most notable first. */
export function matchChips(m: Match): Chip[] {
  const me = myLine(m)
  const i = matchInsight(m)
  const won = isWin(m)
  const size = myTeam(m).players.length
  const chips: Chip[] = []
  if (isMvp(m)) chips.push({ label: 'MVP', tone: 'gold', title: 'Highest score on the winning team' })
  else if (i.lobbyRank === 1) chips.push({ label: 'Top score in lobby', tone: 'gold', title: 'Highest score of everyone in the match' })
  if (i.mmrGap !== null && won && i.mmrGap >= GAP)
    chips.push({ label: `Underdog win +${i.mmrGap}`, tone: 'pos', title: `Opponents averaged ${i.mmrGap} MMR more than your team` })
  if (i.mmrGap !== null && !won && i.mmrGap <= -GAP)
    chips.push({ label: `Upset loss ${i.mmrGap}`, tone: 'neg', title: `Opponents averaged ${-i.mmrGap} MMR less than your team` })
  if (size > 1 && i.scoreShare >= (1 / size) * 1.3)
    chips.push({ label: `Carried ${Math.round(i.scoreShare * 100)}%`, tone: 'info', title: 'Your share of your team’s total score' })
  if (me.goals >= 3) chips.push({ label: me.goals === 3 ? 'Hat trick' : `${me.goals} goals`, tone: 'pos', title: 'Goals scored' })
  if (me.saves >= 4) chips.push({ label: `Wall · ${me.saves} saves`, tone: 'info', title: 'Saves made' })
  return chips.slice(0, 3)
}

export interface Comparison {
  me: Stats
  teammates: Stats | null
  opponents: Stats
  myMmr: number | null
  opponentMmr: number | null
  /** Average of my lobby score rank, e.g. 1.8 (of lobbySize). */
  avgLobbyRank: number
  lobbySize: number
  matches: number
}

/** My averages next to my teammates' and my opponents' over the same matches. */
export function compare(matches: readonly Match[]): Comparison | null {
  if (!matches.length) return null
  const mates = matches.flatMap(teammates)
  const insights = matches.map(matchInsight)
  const mmrs = matches.map((m) => myLine(m).mmr).filter((v): v is number => v !== null)
  const opp = insights.map((x) => x.opponentMmr).filter((v): v is number => v !== null)
  const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)
  return {
    me: averages(matches.map(myLine)),
    teammates: mates.length ? averages(mates) : null,
    opponents: averages(matches.flatMap(opponents)),
    myMmr: mean(mmrs),
    opponentMmr: mean(opp),
    avgLobbyRank: mean(insights.map((x) => x.lobbyRank))!,
    lobbySize: Math.max(...insights.map((x) => x.lobbySize)),
    matches: matches.length
  }
}
