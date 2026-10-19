import { useMemo, useState } from 'react'
import { sessionMatches } from '../../../core/sessions'
import { mmrSeries, modeOverview, modesPlayed, sessionSummaries } from '../../../core/stats'
import { MODES, type Mode, type Settings, type TrackerData } from '../../../core/types'
import { LineChart } from '../components/LineChart'
import { formatDate, formatTime, signed } from '../format'

const RANGES = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null }
] as const

const MODE_COLORS: Record<Mode, string> = { '1v1': '#3ecf8e', '2v2': '#2f8cff', '3v3': '#ff8a1f' }

/** Long-term view: per-mode cards, MMR over time, past sessions. */
export function Dashboard({ data, settings, onOpenSession }: { data: TrackerData; settings: Settings; onOpenSession: (id: string) => void }) {
  const played = modesPlayed(data.matches)
  const [picked, setMode] = useState<Mode | null>(null)
  const mode = picked && played.includes(picked) ? picked : (played.includes('2v2') ? '2v2' : played[0]) ?? null
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('90')

  const chart = useMemo(() => {
    if (!mode) return null
    const days = RANGES.find((r) => r.key === range)!.days
    const since = days === null ? 0 : Date.now() - days * 86_400_000
    const inRange = data.matches.filter((m) => Date.parse(m.recordedAt) >= since)
    const series = mmrSeries(inRange, mode, days === null ? settings.startingMmr[mode] : undefined)
    return {
      points: series.map((p) => ({ label: formatDate(p.at), values: { mmr: p.mmr } })),
      boundaries: series.flatMap((p, i) => (p.sessionStart ? [i] : []))
    }
  }, [data.matches, mode, range, settings.startingMmr])

  const sessions = [...data.sessions].reverse()

  if (!data.matches.length) {
    return (
      <div className="section">
        <div className="empty">
          No matches yet. After a competitive match, press <kbd>{settings.hotkeys.capture}</kbd> while the scoreboard is on screen.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mode-cards">
        {MODES.filter((m) => played.includes(m)).map((m) => {
          const o = modeOverview(data.matches, m)
          return (
            <button key={m} className={`mode-card ${m === mode ? 'active' : ''}`} onClick={() => setMode(m)}>
              <div className="mode-name" style={{ color: MODE_COLORS[m] }}>
                {m}
              </div>
              <div className="mode-mmr">{o.current ?? '—'}</div>
              <div className="sub">
                Peak {o.peak ?? '—'} · {o.wins}–{o.losses} · {Math.round(o.winRate * 100)}%
              </div>
            </button>
          )
        })}
      </div>

      {mode && chart && (
        <div className="section">
          <header>
            <h2>{mode} MMR</h2>
            <div className="seg">
              {RANGES.map((r) => (
                <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
          </header>
          <div className="section-body">
            <LineChart
              series={[{ key: 'mmr', label: `${mode} MMR`, color: MODE_COLORS[mode] }]}
              points={chart.points}
              boundaries={chart.boundaries}
              empty={`No ${mode} matches in this range.`}
            />
            <div className="sub">Dashed lines mark the start of a new session.</div>
          </div>
        </div>
      )}

      <div className="section">
        <header>
          <h2>Sessions</h2>
          <span className="hint">{sessions.length} total</span>
        </header>
        {sessions.length ? (
          <table className="clickable">
            <thead>
              <tr>
                <th className="left">Date</th>
                <th className="left">Time</th>
                <th>Matches</th>
                <th className="left">Result per mode</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const matches = sessionMatches(data, s.id)
                return (
                  <tr key={s.id} onClick={() => onOpenSession(s.id)}>
                    <td className="left">{formatDate(s.startedAt)}</td>
                    <td className="left sub">
                      {formatTime(s.startedAt)} – {s.endedAt ? formatTime(s.endedAt) : 'live'}
                    </td>
                    <td>{matches.length}</td>
                    <td className="left">
                      {sessionSummaries(matches).map((x) => (
                        <span key={x.mode} className="chip">
                          {x.mode} {x.wins}–{x.losses}{' '}
                          <b className={x.mmrDelta > 0 ? 'pos' : x.mmrDelta < 0 ? 'neg' : ''}>{signed(x.mmrDelta)}</b>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">No sessions yet.</div>
        )}
      </div>
    </>
  )
}
