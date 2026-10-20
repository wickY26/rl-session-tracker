import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findDuplicate } from '../../core/teams'
import { DEFAULT_PLAYLIST, MODES, STAT_KEYS, type Mode, type NewMatch, type Playlist, type PlayerRef, type StatKey } from '../../core/types'
import { matchErrors } from '../../core/validate'
import type { ScoreboardReading, TeamColor } from '../../ocr/types'
import type { AppState, ConfirmPayload } from '../../shared/api'
import { IntInput } from './components/IntInput'
import { signed, STAT_LABELS } from './format'

interface DraftPlayer {
  name: string
  mmr: number | null
  mmrDelta: number | null
  party: boolean
  stats: Record<StatKey, number | null>
}

interface DraftTeam {
  color: TeamColor | null
  players: DraftPlayer[]
}

interface Draft {
  mode: Mode
  playlist: Playlist
  winner: 0 | 1 | null
  me: PlayerRef | null
  teams: [DraftTeam, DraftTeam]
  screenshot: string | null
}

const emptyStats = (): Record<StatKey, number | null> => ({ score: null, goals: null, assists: null, saves: null, shots: null })
const emptyPlayer = (): DraftPlayer => ({ name: '', mmr: null, mmrDelta: null, party: false, stats: emptyStats() })
const sizeOf = (mode: Mode) => MODES.indexOf(mode) + 1

/** Pads or trims both teams to the mode's team size. */
function resize(teams: [DraftTeam, DraftTeam], mode: Mode): [DraftTeam, DraftTeam] {
  const size = sizeOf(mode)
  const fit = (t: DraftTeam): DraftTeam => ({
    ...t,
    players: Array.from({ length: size }, (_, i) => t.players[i] ?? emptyPlayer())
  })
  return [fit(teams[0]), fit(teams[1])]
}

function fromReading(r: ScoreboardReading): Draft {
  const longest = Math.max(1, ...r.teams.map((t) => t.players.length))
  const mode = r.mode ?? MODES[Math.min(longest, 3) - 1]
  const teams = r.teams.map((t) => ({
    color: t.color,
    players: t.players.map((p) => ({ name: p.name, mmr: p.mmr, mmrDelta: p.mmrDelta, party: p.party, stats: { ...p.stats } }))
  })) as [DraftTeam, DraftTeam]
  return { mode, playlist: DEFAULT_PLAYLIST[mode], winner: r.winner, me: r.me, teams: resize(teams, mode), screenshot: null }
}

function fromMatch(m: NewMatch): Draft {
  const teams = m.teams.map((t) => ({
    color: null,
    players: t.players.map(({ name, mmr, mmrDelta, party, ...stats }) => ({ name, mmr, mmrDelta, party, stats: { ...stats } }))
  })) as [DraftTeam, DraftTeam]
  return { mode: m.mode, playlist: m.playlist, winner: m.winner, me: m.me, teams, screenshot: m.screenshot }
}

function goalsOf(t: DraftTeam): number | null {
  let sum = 0
  for (const p of t.players) {
    if (p.stats.goals === null) return null
    sum += p.stats.goals
  }
  return sum
}

/** Draft → match, or null while required cells are empty. */
function toMatch(d: Draft): NewMatch | null {
  if (d.winner === null || !d.me) return null
  const teams = d.teams.map((t) => {
    const goals = goalsOf(t)
    if (goals === null) return null
    const players = t.players.map((p) => {
      if (STAT_KEYS.some((k) => p.stats[k] === null)) return null
      return { name: p.name.trim(), mmr: p.mmr, mmrDelta: p.mmrDelta, party: p.party, ...(p.stats as Record<StatKey, number>) }
    })
    if (players.some((p) => !p)) return null
    return { goals, players: players as NewMatch['teams'][0]['players'] }
  })
  if (teams.some((t) => !t)) return null
  return {
    mode: d.mode,
    playlist: d.playlist,
    teams: teams as NewMatch['teams'],
    winner: d.winner,
    me: d.me,
    screenshot: d.screenshot
  }
}

export function Confirm() {
  const [payload, setPayload] = useState<ConfirmPayload | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [state, setState] = useState<AppState | null>(null)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const firstInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const off = window.api.onConfirmPayload((p) => {
      setPayload(p)
      setSaveErrors([])
      if (p.status === 'ready') setDraft(fromReading(p.reading))
      else if (p.status === 'edit') setDraft(fromMatch(p.match))
      else setDraft(null)
      void window.api.getState().then(setState)
    })
    window.api.confirmReady()
    return off
  }, [])

  const editId = payload?.status === 'edit' ? payload.matchId : null
  const ocrWarnings = payload?.status === 'ready' ? payload.reading.warnings : []

  const match = useMemo(() => (draft ? toMatch(draft) : null), [draft])

  const checks = useMemo(() => {
    if (!draft || !state) return { warnings: [] as string[], blocking: [] as string[] }
    if (!match) return { warnings: [], blocking: ['Missing fields (red boxes), the winner or which row is you — fill them in to save'] }
    const blocking = matchErrors(match)
    const others = editId ? state.data.matches.filter((m) => m.id !== editId) : state.data.matches
    const duplicate = findDuplicate(others, match)
    const warnings = duplicate ? ['This scoreboard looks already saved (same names and stats)'] : []
    const [a, b] = match.teams.map((t) => t.goals)
    if (a !== b && (a > b ? 0 : 1) !== match.winner) {
      warnings.push('Goal totals point to the other team — check the goals (own goals can cause this too)')
    }
    const myDelta = match.teams[match.me.team].players[match.me.index]?.mmrDelta
    const won = match.winner === match.me.team
    if (myDelta !== null && myDelta !== undefined && myDelta !== 0 && myDelta > 0 !== won) {
      warnings.push(`Your MMR ${myDelta > 0 ? 'went up' : 'went down'} but this is marked as a ${won ? 'win' : 'loss'} — check the winner or the ± value`)
    }
    return { warnings, blocking }
  }, [draft, state, match, editId])

  const close = useCallback(() => {
    setPayload(null)
    setDraft(null)
    window.api.closeConfirm()
  }, [])

  const save = useCallback(async () => {
    if (saving) return
    if (!match || checks.blocking.length) {
      // F8 from the game while the card isn't focused: the player may not be looking, so beep
      window.api.playSound('error')
      return
    }
    setSaving(true)
    try {
      const res = await window.api.saveMatch(match, editId)
      if (res.ok) {
        setPayload(null)
        setDraft(null)
      } else setSaveErrors(res.errors)
    } finally {
      setSaving(false)
    }
  }, [match, checks.blocking.length, saving, editId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, save])

  // The card isn't focused, so in-game hotkeys arrive as commands (F8 save / F7 cancel)
  useEffect(
    () =>
      window.api.onConfirmCommand((cmd) => {
        if (cmd === 'save' && draft) void save()
        else close()
      }),
    [close, save, draft]
  )

  const hk = state?.settings.hotkeys

  const updatePlayer = (ti: 0 | 1, pi: number, fn: (p: DraftPlayer) => DraftPlayer) => {
    if (!draft) return
    const teams = draft.teams.map((t, i) =>
      i === ti ? { ...t, players: t.players.map((p, j) => (j === pi ? fn(p) : p)) } : t
    ) as Draft['teams']
    // The winner never follows the goal totals: it comes from the WINNER banner (or a click), and a
    // misread goal cell must not silently turn a win into a loss
    setDraft({ ...draft, teams })
  }

  const setMode = (mode: Mode) => {
    if (!draft) return
    const size = sizeOf(mode)
    const me = draft.me && draft.me.index < size ? draft.me : null
    setDraft({ ...draft, mode, playlist: DEFAULT_PLAYLIST[mode], teams: resize(draft.teams, mode), me })
  }

  const title =
    payload?.status === 'edit' ? 'Edit match' : payload?.status === 'reading' ? 'Reading the scoreboard…' : 'Confirm match'

  return (
    <div className="confirm">
      <div className="confirm-head">
        <h1>{title}</h1>
        <button className="ghost" onClick={close} title="Esc">
          ✕
        </button>
      </div>
      <div className="confirm-body">
        {!payload && <div className="state-box">Waiting…</div>}

        {payload?.status === 'reading' && (
          <div className="state-box">
            <div className="spinner" />
            <div className="big">Reading…</div>
            <div className="sub">Takes a few seconds</div>
          </div>
        )}

        {payload?.status === 'error' && (
          <div className="state-box error">
            <div className="big">⚠ {payload.error}</div>
            <div className="sub">Close this with Esc and try again while the scoreboard is on screen.</div>
          </div>
        )}

        {payload?.status === 'casual' && (
          <div className="state-box">
            <div className="big">Casual match — not saved</div>
            <div className="sub">
              No <code>[MMR ± change]</code> on this scoreboard. Only competitive matches are tracked.
            </div>
          </div>
        )}

        {draft && state && (
          <>
            {checks.blocking.length + checks.warnings.length + ocrWarnings.length + saveErrors.length > 0 && (
              <ul className="warn-list">
                {[...new Set([...saveErrors, ...checks.blocking])].map((w) => (
                  <li key={w} className="block">
                    {w}
                  </li>
                ))}
                {[...new Set([...ocrWarnings, ...checks.warnings])].map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            <div className="card-meta">
              <label>
                Mode
                <select value={draft.mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              {match && (
                <span className="sub">
                  {match.winner === match.me.team ? '🏆 Win' : 'Loss'}
                  {match.teams[match.me.team].players[match.me.index].mmrDelta !== null &&
                    ` · ${signed(match.teams[match.me.team].players[match.me.index].mmrDelta!)} MMR`}
                </span>
              )}
            </div>

            {([0, 1] as const).map((ti) => {
              const team = draft.teams[ti]
              const mine = draft.me?.team === ti
              const goals = goalsOf(team)
              return (
                <div className={`team-edit ${team.color ?? (ti === 0 ? 'blue' : 'orange')}`} key={ti}>
                  <header>
                    <span className="team-name">{team.color === 'orange' ? 'Orange' : team.color === 'blue' ? 'Blue' : `Team ${ti + 1}`}</span>
                    <span className="sub">Goals {goals ?? '?'}</span>
                    <label className="win-pill">
                      <input type="radio" name="winner" checked={draft.winner === ti} onChange={() => setDraft({ ...draft, winner: ti })} />
                      Winner
                    </label>
                  </header>
                  <table>
                    <thead>
                      <tr>
                        <th className="center">Me</th>
                        <th className="left">Player</th>
                        <th>MMR</th>
                        <th>±</th>
                        <th className="center">Party</th>
                        {STAT_KEYS.map((k) => (
                          <th key={k}>{STAT_LABELS[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {team.players.map((p, pi) => {
                        const isMe = draft.me?.team === ti && draft.me.index === pi
                        return (
                          <tr key={pi} className={isMe ? 'me' : ''}>
                            <td className="center">
                              <input
                                type="radio"
                                name="me"
                                checked={isMe}
                                onChange={() => setDraft({ ...draft, me: { team: ti, index: pi } })}
                              />
                            </td>
                            <td className="left">
                              <input
                                ref={ti === 0 && pi === 0 ? firstInput : undefined}
                                className={`name ${p.name.trim() ? '' : 'invalid'}`}
                                value={p.name}
                                onChange={(e) => updatePlayer(ti, pi, (x) => ({ ...x, name: e.target.value }))}
                              />
                            </td>
                            <td>
                              <IntInput
                                className={`mmr ${isMe && p.mmr === null ? 'invalid' : ''}`}
                                value={p.mmr}
                                onChange={(v) => updatePlayer(ti, pi, (x) => ({ ...x, mmr: v }))}
                              />
                            </td>
                            <td>
                              <IntInput
                                signed
                                className={`mmr ${isMe && p.mmrDelta === null ? 'invalid' : ''}`}
                                value={p.mmrDelta}
                                onChange={(v) => updatePlayer(ti, pi, (x) => ({ ...x, mmrDelta: v }))}
                              />
                            </td>
                            <td className="center">
                              {mine && !isMe ? (
                                <input
                                  type="checkbox"
                                  checked={p.party}
                                  title="Premade teammate (green party icon)"
                                  onChange={(e) => updatePlayer(ti, pi, (x) => ({ ...x, party: e.target.checked }))}
                                />
                              ) : (
                                <span className="sub">{p.party ? <span className="party">●</span> : '—'}</span>
                              )}
                            </td>
                            {STAT_KEYS.map((k) => (
                              <td key={k}>
                                <IntInput
                                  className={`stat ${p.stats[k] === null ? 'invalid' : ''}`}
                                  value={p.stats[k]}
                                  onChange={(v) =>
                                    updatePlayer(ti, pi, (x) => ({ ...x, stats: { ...x.stats, [k]: v === null ? null : Math.max(0, v) } }))
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </>
        )}

        {payload?.image && payload.status !== 'reading' && (
          <details className="shot-wrap" open={payload.status === 'error' || payload.status === 'casual'}>
            <summary>Screenshot</summary>
            <img className="shot" src={payload.image} alt="Captured scoreboard" />
          </details>
        )}
        {payload?.status === 'reading' && payload.image && <img className="shot" src={payload.image} alt="Captured screen" />}
      </div>
      <div className="confirm-foot">
        <span className="sub">
          In game: <kbd>{hk?.capture ?? 'F8'}</kbd> save · <kbd>{hk?.cancel ?? 'F7'}</kbd> cancel · click the card to fix values (
          <kbd>Enter</kbd> / <kbd>Esc</kbd>)
        </span>
        <div className="spacer" />
        <button onClick={close}>{draft ? 'Cancel' : 'Close'}</button>
        {draft && (
          <button className="primary" disabled={!match || checks.blocking.length > 0 || saving} onClick={() => void save()}>
            {editId ? 'Update' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}
