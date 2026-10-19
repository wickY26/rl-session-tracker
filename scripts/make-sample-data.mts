/**
 * Writes a realistic sample tracker.json (sessions over ~6 weeks, all modes, premade teams) for
 * checking the screens without playing:
 *   npx tsx scripts/make-sample-data.mts <out.json> [accountName]
 * Use with the self-test: RLST_SELFTEST_DATA=<out.json>
 */
import { writeFileSync } from 'node:fs'
import { addMatch, emptyData, endSession } from '../src/core/sessions'
import { DEFAULT_PLAYLIST, type Mode, type NewMatch, type PlayerLine, type TrackerData } from '../src/core/types'

const [out, account = 'wickY26'] = process.argv.slice(2)
if (!out) throw new Error('usage: make-sample-data.mts <out.json> [accountName]')

// Deterministic pseudo-random so the sample looks the same every run
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))

const mmr: Record<Mode, number> = { '1v1': 780, '2v2': 1180, '3v3': 1040 }
const friends = ['endieych', 'damdakideli', 'orkuno']
/** Rating of the current lobby; teammates and opponents sit around it. */
let lobbyMmr = 1000

function line(name: string, over: Partial<PlayerLine> = {}): PlayerLine {
  const goals = int(0, 3)
  return { name, mmr: lobbyMmr + int(-45, 45), mmrDelta: null, party: false, score: 150 + goals * 110 + int(0, 250), goals, assists: int(0, 2), saves: int(0, 4), shots: goals + int(0, 4), ...over }
}

function match(mode: Mode): NewMatch {
  const size = Number(mode[0])
  const win = rand() < 0.53
  const delta = (win ? 1 : -1) * int(7, 12)
  lobbyMmr = mmr[mode]
  mmr[mode] += delta
  const me = line(account, { mmr: mmr[mode], mmrDelta: delta, score: win ? int(350, 700) : int(150, 450) })
  // 2v2 mostly with a premade friend, 3v3 with two premades or one + a random
  const mates: PlayerLine[] =
    mode === '2v2' && rand() < 0.7
      ? [line(pick(friends.slice(0, 2)), { party: true })]
      : mode === '3v3'
        ? rand() < 0.6
          ? [line('endieych', { party: true }), line('orkuno', { party: true })]
          : [line('endieych', { party: true }), line(`random${int(1, 99)}`)]
        : Array.from({ length: size - 1 }, () => line(`random${int(1, 99)}`))
  // Losses lean towards stronger opponents
  const opponents = Array.from({ length: size }, () => line(`opp${int(1, 999)}`, { mmr: lobbyMmr + int(win ? -50 : -20, win ? 30 : 60) }))
  const myGoals = [me, ...mates].reduce((s, p) => s + p.goals, 0)
  const theirGoals = opponents.reduce((s, p) => s + p.goals, 0)
  return {
    mode,
    playlist: DEFAULT_PLAYLIST[mode],
    teams: [
      { goals: Math.max(myGoals, win ? theirGoals + 1 : 0), players: [me, ...mates] },
      { goals: Math.max(theirGoals, win ? 0 : myGoals + 1), players: opponents }
    ],
    winner: win ? 0 : 1,
    me: { team: 0, index: 0 },
    screenshot: null
  }
}

let data: TrackerData = emptyData()
let n = 0
const newId = () => `sample-${String(++n).padStart(4, '0')}`
const start = Date.now() - 42 * 86_400_000
for (let day = 0; day < 42; day += int(1, 4)) {
  let t = start + day * 86_400_000 + int(18, 21) * 3_600_000
  const games = int(4, 10)
  for (let g = 0; g < games; g++) {
    const mode: Mode = rand() < 0.65 ? '2v2' : rand() < 0.7 ? '3v3' : '1v1'
    data = addMatch(data, match(mode), new Date(t), 120, newId).data
    t += int(6, 9) * 60_000
  }
  // Leave the last session open, the rest ended by hand
  if (day < 40) data = endSession(data, new Date(t))
}
writeFileSync(out, JSON.stringify(data, null, 2))
console.log(`${out}: ${data.sessions.length} sessions, ${data.matches.length} matches`)
