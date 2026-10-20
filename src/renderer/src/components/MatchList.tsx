import { isMvp, isWin, myLine } from '../../../core/stats'
import { teammates } from '../../../core/teams'
import { missingFields } from '../../../core/validate'
import type { Match } from '../../../core/types'
import { formatDateTime, formatTime, signed } from '../format'

/** Matches, newest first, from my side: result, MMR, teammates, my stats; edit/delete per row. */
export function MatchList({ matches, showDate = false, showMode = false }: { matches: readonly Match[]; showDate?: boolean; showMode?: boolean }) {
  if (!matches.length) return <div className="empty">No matches.</div>
  return (
    <table className="match-list">
      <thead>
        <tr>
          <th className="left">{showDate ? 'When' : 'Time'}</th>
          {showMode && <th className="left">Mode</th>}
          <th className="left">Result</th>
          <th>MMR</th>
          <th>±</th>
          <th className="left">With</th>
          <th>Score</th>
          <th>Goals</th>
          <th>Assists</th>
          <th>Saves</th>
          <th>Shots</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {[...matches].reverse().map((m) => {
          const me = myLine(m)
          const won = isWin(m)
          const mates = teammates(m)
          return (
            <tr key={m.id}>
              <td className="left sub">{showDate ? formatDateTime(m.recordedAt) : formatTime(m.recordedAt)}</td>
              {showMode && <td className="left">{m.mode}</td>}
              <td className={`left ${won ? 'pos' : 'neg'}`}>
                {won ? 'Win' : 'Loss'} {isMvp(m) && <span title="MVP">⭐</span>}
              </td>
              <td>{me.mmr ?? '—'}</td>
              <td className={me.mmrDelta === null ? '' : me.mmrDelta >= 0 ? 'pos' : 'neg'}>{me.mmrDelta === null ? '—' : signed(me.mmrDelta)}</td>
              <td className="left">
                {mates.length
                  ? mates.map((p, i) => (
                      <span key={i} className="mate" title={p.party ? 'Premade' : 'Random'}>
                        {p.party && <span className="party">● </span>}
                        {p.name}
                      </span>
                    ))
                  : <span className="sub">—</span>}
              </td>
              <td>{me.score ?? '—'}</td>
              <td>{me.goals ?? '—'}</td>
              <td>{me.assists ?? '—'}</td>
              <td>{me.saves ?? '—'}</td>
              <td>{me.shots ?? '—'}</td>
              <td className="row-actions">
                {missingFields(m).length > 0 && (
                  <button className="review-badge" onClick={() => void window.api.editMatch(m.id)} title="Some values couldn't be read — click to fill in">
                    Review · {missingFields(m).length}
                  </button>
                )}
                <button className="ghost" onClick={() => void window.api.editMatch(m.id)} title="Edit">
                  ✎
                </button>
                <button
                  className="ghost"
                  title="Delete"
                  onClick={() => {
                    if (confirm('Delete this match? Session and team stats are recalculated.')) void window.api.deleteMatch(m.id)
                  }}
                >
                  🗑
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
