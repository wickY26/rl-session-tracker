import { matchChips, matchInsight, opponents } from '../../../core/insights'
import { isWin, myLine, myTeam } from '../../../core/stats'
import type { Match, PlayerLine } from '../../../core/types'
import { formatTime, signed } from '../format'

function PlayerRow({ p, me }: { p: PlayerLine; me: boolean }) {
  return (
    <li className={me ? 'me' : ''}>
      <span className="pc-name">
        {p.party && (
          <span className="party" title="Premade">
            ●
          </span>
        )}
        {p.name || '?'}
        {me && <span className="you">you</span>}
      </span>
      <span className="pc-mmr">{p.mmr ?? '—'}</span>
      <span className="pc-score">{p.score}</span>
    </li>
  )
}

/** One match from my side: result, MMR change, both teams (score order) and highlights. */
export function MatchCard({ match: m, showDate }: { match: Match; showDate?: string }) {
  const won = isWin(m)
  const me = myLine(m)
  const mine = [...myTeam(m).players].sort((a, b) => b.score - a.score)
  const theirs = [...opponents(m)].sort((a, b) => b.score - a.score)
  const myGoals = myTeam(m).goals
  const theirGoals = m.teams[m.me.team === 0 ? 1 : 0].goals
  const insight = matchInsight(m)
  const chips = matchChips(m)

  return (
    <article className={`match-card ${won ? 'win' : 'loss'}`} aria-label={`${won ? 'Win' : 'Loss'} ${myGoals}–${theirGoals}`}>
      <header>
        <span className="mc-result">{won ? 'WIN' : 'LOSS'}</span>
        <span className="mc-score">
          {myGoals}–{theirGoals}
        </span>
        <span className="sub">
          {showDate ? `${showDate} · ` : ''}
          {formatTime(m.recordedAt)} · #{insight.lobbyRank} of {insight.lobbySize} by score
        </span>
        <span className="spacer" />
        {me.mmrDelta !== null && (
          <span className={`mmr-pill ${me.mmrDelta >= 0 ? 'pos' : 'neg'}`} title="MMR change → MMR after the match">
            {signed(me.mmrDelta)} <span className="after">→ {me.mmr ?? '?'}</span>
          </span>
        )}
        <span className="mc-actions">
          <button className="ghost" onClick={() => void window.api.editMatch(m.id)} aria-label="Edit match" title="Edit">
            ✎
          </button>
          <button
            className="ghost"
            aria-label="Delete match"
            title="Delete"
            onClick={() => {
              if (confirm('Delete this match? Session and team stats are recalculated.')) void window.api.deleteMatch(m.id)
            }}
          >
            🗑
          </button>
        </span>
      </header>

      <div className="mc-teams">
        <div className="mc-team">
          <div className="mc-team-head">
            <span>Your team</span>
            <span>MMR</span>
            <span>Score</span>
          </div>
          <ul>
            {mine.map((p, i) => (
              <PlayerRow key={i} p={p} me={p === me} />
            ))}
          </ul>
        </div>
        <div className="mc-team opp">
          <div className="mc-team-head">
            <span>Opponents</span>
            <span>MMR</span>
            <span>Score</span>
          </div>
          <ul>
            {theirs.map((p, i) => (
              <PlayerRow key={i} p={p} me={false} />
            ))}
          </ul>
        </div>
      </div>

      <footer>
        <span className="mc-line">
          <b>{me.goals}</b> goals · <b>{me.assists}</b> assists · <b>{me.saves}</b> saves · <b>{me.shots}</b> shots
        </span>
        {insight.mmrGap !== null && insight.mmrGap !== 0 && (
          <span className="sub" title="Opponents' average MMR minus your team's">
            Opponents {insight.mmrGap > 0 ? `+${insight.mmrGap}` : insight.mmrGap} MMR
          </span>
        )}
        <span className="spacer" />
        {chips.map((c) => (
          <span key={c.label} className={`chip-tone ${c.tone}`} title={c.title}>
            {c.label}
          </span>
        ))}
      </footer>
    </article>
  )
}
