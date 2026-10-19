import type { ModeSummary } from '../../../core/stats'
import { signed } from '../format'

type Tone = 'pos' | 'neg' | 'gold' | 'info'

function Tile({ label, value, sub, tone, wide }: { label: string; value: string; sub?: string; tone?: Tone; wide?: boolean }) {
  return (
    <div className={`tile ${tone ?? ''} ${wide ? 'wide' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  )
}

const one = (n: number) => n.toFixed(1)
const toneOf = (n: number): Tone | undefined => (n > 0 ? 'pos' : n < 0 ? 'neg' : undefined)

/** Summary tiles for one mode. Colour = meaning: green up/good, red down/bad, gold MVP, blue neutral stats. */
export function Tiles({ summary: s }: { summary: ModeSummary }) {
  const range = s.mmrStart !== null && s.mmrEnd !== null ? `${s.mmrStart} → ${s.mmrEnd}` : undefined
  const winTone: Tone | undefined = s.matches ? (s.winRate > 0.5 ? 'pos' : s.winRate < 0.5 ? 'neg' : undefined) : undefined
  return (
    <div className="tiles">
      <Tile wide label="MMR" value={signed(s.mmrDelta)} sub={range} tone={toneOf(s.mmrDelta)} />
      <Tile wide label="Record" value={`${s.wins}–${s.losses}`} sub={`${Math.round(s.winRate * 100)}% wins`} tone={winTone} />
      <Tile
        label="Streak"
        value={s.streak ? `${s.streak.kind}${s.streak.count}` : '—'}
        sub={s.streak ? (s.streak.kind === 'W' ? 'wins in a row' : 'losses in a row') : undefined}
        tone={s.streak ? (s.streak.kind === 'W' ? 'pos' : 'neg') : undefined}
      />
      <Tile label="MVP" value={String(s.mvps)} sub={s.matches ? `${Math.round((s.mvps / s.matches) * 100)}% of matches` : undefined} tone={s.mvps ? 'gold' : undefined} />
      <Tile
        label="Avg score"
        value={String(Math.round(s.averages.score))}
        sub={`${one(s.averages.goals)} G · ${one(s.averages.saves)} SV`}
        tone="info"
      />
    </div>
  )
}
