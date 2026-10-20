import { compare } from '../../../core/insights'
import { STAT_KEYS, type Match, type StatKey } from '../../../core/types'
import { STAT_LABELS } from '../format'

const fmt = (key: StatKey, v: number) => (key === 'score' ? String(Math.round(v)) : v.toFixed(1))

/** My averages next to my teammates' and opponents' over the same matches, as bars per stat. */
export function Comparison({ matches }: { matches: readonly Match[] }) {
  const c = compare(matches)
  if (!c) return null
  const groups = [
    { key: 'me', label: 'You', stats: c.me },
    ...(c.teammates ? [{ key: 'mates', label: 'Teammates', stats: c.teammates }] : []),
    { key: 'opp', label: 'Opponents', stats: c.opponents }
  ]
  const gap = c.myMmr !== null && c.opponentMmr !== null ? Math.round(c.opponentMmr - c.myMmr) : null
  // Stats where I'm the best of the three groups
  const leads = STAT_KEYS.filter((k) => groups.every((g) => g.key === 'me' || c.me[k] > g.stats[k]))

  return (
    <div className="compare">
      <div className="compare-head">
        <div>
          <div className="tile-label">Lobby rank by score</div>
          <div className="compare-big">
            {c.avgLobbyRank === null ? '—' : `#${c.avgLobbyRank.toFixed(1)}`} <span className="sub">of {c.lobbySize} on average</span>
          </div>
        </div>
        {gap !== null && (
          <div>
            <div className="tile-label">Opponents vs your MMR</div>
            <div className={`compare-big ${gap > 0 ? 'info' : ''}`}>
              {gap > 0 ? `+${gap}` : gap} <span className="sub">{gap > 0 ? 'you played up' : gap < 0 ? 'you were favoured' : 'even'}</span>
            </div>
          </div>
        )}
        <div className="compare-legend">
          {groups.map((g) => (
            <span key={g.key}>
              <i className={`sw ${g.key}`} />
              {g.label}
            </span>
          ))}
        </div>
      </div>
      <div className="compare-rows">
        {STAT_KEYS.map((k) => {
          const max = Math.max(...groups.map((g) => g.stats[k]), 0.0001)
          return (
            <div className="compare-row" key={k}>
              <div className="compare-label">
                {STAT_LABELS[k]}
                {leads.includes(k) && <span className="lead">best</span>}
              </div>
              <div className="compare-bars">
                {groups.map((g) => (
                  <div className="bar-line" key={g.key} title={`${g.label}: ${fmt(k, g.stats[k])} per match`}>
                    <div className={`bar ${g.key}`} style={{ width: `${(g.stats[k] / max) * 100}%` }} />
                    <span className="bar-value">{fmt(k, g.stats[k])}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
