import { averages, isWin, myLine, myTeam } from './stats'
import { foldName, levenshtein } from './text'
import { STAT_KEYS, type Match, type Mode, type NewMatch, type PlayerLine, type Stats, type TrackerData } from './types'

type MatchLike = Match | NewMatch

export function teammates(m: MatchLike): PlayerLine[] {
  return m.teams[m.me.team].players.filter((_, i) => i !== m.me.index)
}

/**
 * Team identity: mode + my teammates' names. Only premade lineups form a team —
 * every teammate must have the party icon (so 1v1 never does, and a 3v3 with one random doesn't).
 */
export function teamKey(m: MatchLike): string | null {
  const mates = teammates(m)
  // An unreadable teammate name can't be told apart from other friends: no team until it's fixed
  if (!mates.length || mates.some((p) => !p.party || !p.name.trim())) return null
  return `${m.mode}:${mates
    .map((p) => p.name.toLowerCase())
    .sort()
    .join('+')}`
}

export interface TeammateStats {
  name: string
  averages: Stats
}

export interface TeamStats {
  key: string
  mode: Mode
  /** Teammate names as spelled in the latest match. */
  members: string[]
  matches: number
  wins: number
  losses: number
  winRate: number
  /** Sum of my readable MMR changes while playing together. */
  mmrDelta: number
  myAverages: Stats
  teammates: TeammateStats[]
  lastPlayedAt: string
  tracked: boolean
}

/** All premade teams, most played first. Untracked ones are included with `tracked: false`. */
export function deriveTeams(data: TrackerData): TeamStats[] {
  const groups = new Map<string, Match[]>()
  for (const m of data.matches) {
    const key = teamKey(m)
    if (key) groups.set(key, [...(groups.get(key) ?? []), m])
  }
  const untracked = new Set(data.untrackedTeams)
  const teams = [...groups].map(([key, matches]): TeamStats => {
    const latest = matches[matches.length - 1]
    const wins = matches.filter(isWin).length
    const members = teammates(latest).map((p) => p.name)
    return {
      key,
      mode: latest.mode,
      members,
      matches: matches.length,
      wins,
      losses: matches.length - wins,
      winRate: wins / matches.length,
      mmrDelta: matches.reduce((s, m) => s + (myLine(m).mmrDelta ?? 0), 0),
      myAverages: averages(matches.map(myLine)),
      teammates: members.map((name) => ({
        name,
        averages: averages(
          matches.map((m) => myTeam(m).players.find((p) => p.name.toLowerCase() === name.toLowerCase())!)
        )
      })),
      lastPlayedAt: latest.recordedAt,
      tracked: !untracked.has(key)
    }
  })
  return teams.sort((a, b) => b.matches - a.matches || b.lastPlayedAt.localeCompare(a.lastPlayedAt))
}

export function setTeamTracked(data: TrackerData, key: string, tracked: boolean): TrackerData {
  const rest = data.untrackedTeams.filter((k) => k !== key)
  return { ...data, untrackedTeams: tracked ? rest : [...rest, key] }
}

/** Names of every premade teammate seen so far, latest spelling first, no duplicates (case-insensitive). */
export function knownTeammates(matches: readonly Match[]): string[] {
  const seen = new Map<string, string>()
  for (let i = matches.length - 1; i >= 0; i--) {
    for (const p of teammates(matches[i])) {
      const key = p.name.toLowerCase()
      if (p.party && !seen.has(key)) seen.set(key, p.name)
    }
  }
  return [...seen.values()]
}

/**
 * Snaps an OCR'd teammate name to a known teammate so one friend doesn't split into several teams.
 * Matches when the names are equal after folding OCR-confusable characters (0/O, 1/l/I, 5/S, 8/B),
 * or — for names of 10+ characters — differ by a single character after folding.
 * Short names need an exact fold match, so `wicky26` never snaps to `wicky27`.
 */
export function snapTeammateName(name: string, known: readonly string[]): string {
  const folded = foldName(name)
  const exact = known.find((k) => foldName(k) === folded)
  if (exact) return exact
  if (folded.length < 10) return name
  const close = known.find((k) => levenshtein(foldName(k), folded) <= 1)
  return close ?? name
}

function signature(m: MatchLike): string {
  return [
    m.mode,
    ...m.teams.map((t) => t.players.map((p) => [p.name.toLowerCase(), ...STAT_KEYS.map((k) => p[k])].join(',')).join(';'))
  ].join('|')
}

/** An already saved match with the same mode, names and stats — the same scoreboard captured twice. */
export function findDuplicate(matches: readonly Match[], candidate: NewMatch): Match | null {
  const sig = signature(candidate)
  return matches.find((m) => signature(m) === sig) ?? null
}
