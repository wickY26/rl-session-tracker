import type { ModeSummary } from '../../../core/stats'
import { signed } from '../format'

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  )
}

const one = (n: number) => n.toFixed(1)

/** Summary tiles for one mode: MMR change, record, streak, then my averages. */
export function Tiles({ summary: s }: { summary: ModeSummary }) {
  const range = s.mmrStart !== null && s.mmrEnd !== null ? `${s.mmrStart} → ${s.mmrEnd}` : undefined
  return (
    <div className="tiles">
      <Tile label="MMR" value={signed(s.mmrDelta)} sub={range} tone={s.mmrDelta > 0 ? 'pos' : s.mmrDelta < 0 ? 'neg' : undefined} />
      <Tile label="Record" value={`${s.wins}–${s.losses}`} sub={`${Math.round(s.winRate * 100)}% wins`} />
      <Tile
        label="Streak"
        value={s.streak ? `${s.streak.kind}${s.streak.count}` : '—'}
        tone={s.streak?.kind === 'W' ? 'pos' : s.streak?.kind === 'L' ? 'neg' : undefined}
      />
      <Tile label="MVP" value={String(s.mvps)} />
      <Tile label="Avg score" value={String(Math.round(s.averages.score))} />
      <Tile label="Goals" value={one(s.averages.goals)} sub="per match" />
      <Tile label="Assists" value={one(s.averages.assists)} sub="per match" />
      <Tile label="Saves" value={one(s.averages.saves)} sub="per match" />
      <Tile label="Shots" value={one(s.averages.shots)} sub="per match" />
    </div>
  )
}
