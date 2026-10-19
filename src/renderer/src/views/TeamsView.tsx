import { useState } from 'react'
import { deriveTeams, teamKey } from '../../../core/teams'
import { STAT_KEYS, type Stats, type TrackerData } from '../../../core/types'
import { MatchList } from '../components/MatchList'
import { formatDate, signed, STAT_LABELS } from '../format'

const avg = (stats: Stats, key: keyof Stats) => (key === 'score' ? String(Math.round(stats[key])) : stats[key].toFixed(1))

/** Premade teams (every teammate had the party icon). Untracking hides a team; matches stay. */
export function TeamsView({ data }: { data: TrackerData }) {
  const [showUntracked, setShowUntracked] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const all = deriveTeams(data)
  const teams = all.filter((t) => showUntracked || t.tracked)
  const team = all.find((t) => t.key === selected) ?? null
  const untrackedCount = all.filter((t) => !t.tracked).length

  return (
    <>
      <div className="section">
        <header>
          <h2>Teams</h2>
          <label className="hint check">
            <input type="checkbox" checked={showUntracked} onChange={(e) => setShowUntracked(e.target.checked)} />
            Show untracked ({untrackedCount})
          </label>
        </header>
        {teams.length ? (
          <table className="clickable">
            <thead>
              <tr>
                <th className="left">With</th>
                <th className="left">Mode</th>
                <th>Matches</th>
                <th>W–L</th>
                <th>Win %</th>
                <th>MMR ±</th>
                <th className="left">Last played</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.key} className={`${t.key === selected ? 'selected' : ''} ${t.tracked ? '' : 'muted'}`} onClick={() => setSelected(t.key)}>
                  <td className="left strong">{t.members.join(' + ')}</td>
                  <td className="left">{t.mode}</td>
                  <td>{t.matches}</td>
                  <td>
                    {t.wins}–{t.losses}
                  </td>
                  <td>{Math.round(t.winRate * 100)}%</td>
                  <td className={t.mmrDelta > 0 ? 'pos' : t.mmrDelta < 0 ? 'neg' : ''}>{signed(t.mmrDelta)}</td>
                  <td className="left sub">{formatDate(t.lastPlayedAt)}</td>
                  <td>
                    <button
                      className="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        void window.api.setTeamTracked(t.key, !t.tracked)
                      }}
                    >
                      {t.tracked ? 'Untrack' : 'Track'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            No premade teams yet. A team appears once you play a match where every teammate has the green party icon.
          </div>
        )}
      </div>

      {team && (
        <div className="section">
          <header>
            <h2>
              You + {team.members.join(' + ')} · {team.mode}
            </h2>
            <span className="hint">
              {team.wins}–{team.losses} · {Math.round(team.winRate * 100)}% · {signed(team.mmrDelta)} MMR together
            </span>
          </header>
          <table>
            <thead>
              <tr>
                <th className="left">Averages</th>
                {STAT_KEYS.map((k) => (
                  <th key={k}>{STAT_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="left strong">You</td>
                {STAT_KEYS.map((k) => (
                  <td key={k}>{avg(team.myAverages, k)}</td>
                ))}
              </tr>
              {team.teammates.map((m) => (
                <tr key={m.name}>
                  <td className="left">{m.name}</td>
                  {STAT_KEYS.map((k) => (
                    <td key={k}>{avg(m.averages, k)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <MatchList matches={data.matches.filter((m) => teamKey(m) === team.key)} showDate />
        </div>
      )}
    </>
  )
}
