import { useState } from 'react'
import { MODES, type Mode, type TrackerData } from '../../../core/types'
import { MatchList } from '../components/MatchList'

/** Full match history, filterable by mode; edit/delete recompute everything. */
export function MatchesView({ data }: { data: TrackerData }) {
  const [mode, setMode] = useState<Mode | 'all'>('all')
  const matches = mode === 'all' ? data.matches : data.matches.filter((m) => m.mode === mode)
  return (
    <div className="section">
      <header>
        <h2>All matches</h2>
        <div className="seg">
          {(['all', ...MODES] as const).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'all' ? `All (${data.matches.length})` : `${m} (${data.matches.filter((x) => x.mode === m).length})`}
            </button>
          ))}
        </div>
      </header>
      <MatchList matches={matches} showDate showMode={mode === 'all'} />
    </div>
  )
}
