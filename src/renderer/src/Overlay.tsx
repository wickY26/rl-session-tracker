import { useEffect, useState } from 'react'
import { activeSession, sessionMatches } from '../../core/sessions'
import { sessionSummaries } from '../../core/stats'
import type { AppState } from '../../shared/api'
import { signed } from './format'

/** In-game overlay: the live session at a glance. Click-through; updated on every save. */
export function Overlay() {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    const load = () => void window.api.getState().then(setState)
    load()
    return window.api.onStateChanged(load)
  }, [])
  if (!state) return null
  return (
    <div className={`ov-wrap ${state.settings.overlay.corner}`}>
      <OverlayBox state={state} />
    </div>
  )
}

function OverlayBox({ state }: { state: AppState }) {
  const session = activeSession(state.data)
  if (!session) {
    return (
      <div className="overlay idle">
        <span className="dot" /> No active session · <kbd>{state.settings.hotkeys.session}</kbd> to start
      </div>
    )
  }
  const matches = sessionMatches(state.data, session.id)
  const summaries = sessionSummaries(matches)
  // The mode of the latest match is the one being played now
  const currentMode = matches.length ? matches[matches.length - 1].mode : null
  const main = summaries.find((s) => s.mode === currentMode) ?? null
  const others = summaries.filter((s) => s !== main)

  if (!main) {
    return (
      <div className="overlay idle">
        <span className="dot live" /> Session live · no matches yet
      </div>
    )
  }
  const tone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')
  return (
    <div className="overlay">
      <div className="ov-main">
        <span className="dot live" />
        <span className="ov-mode">{main.mode}</span>
        <span className="ov-record">
          <b className="pos">{main.wins}W</b>–<b className="neg">{main.losses}L</b>
        </span>
        <span className={`ov-mmr ${tone(main.mmrDelta)}`}>{signed(main.mmrDelta)}</span>
        {main.streak && main.streak.count >= 2 && (
          <span className={`ov-streak ${main.streak.kind === 'W' ? 'pos' : 'neg'}`}>
            {main.streak.kind === 'W' ? '🔥' : '❄'}
            {main.streak.kind}
            {main.streak.count}
          </span>
        )}
      </div>
      <div className="ov-sub">
        {main.mmrEnd !== null && <span>{main.mmrEnd} MMR</span>}
        {others.map((s) => (
          <span key={s.mode}>
            {s.mode} {s.wins}–{s.losses} <b className={tone(s.mmrDelta)}>{signed(s.mmrDelta)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}
