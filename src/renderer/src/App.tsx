import { useEffect, useState } from 'react'
import { activeSession, sessionMatches } from '../../core/sessions'
import { sessionSummaries } from '../../core/stats'
import type { AppState } from '../../shared/api'
import { formatTime, signed } from './format'
import { UpdateBanner } from './components/UpdateBanner'
import { Setup } from './Setup'
import { playSound } from './sounds'
import { Dashboard } from './views/Dashboard'
import { MatchesView } from './views/MatchesView'
import { SessionView } from './views/SessionView'
import { SettingsView } from './views/SettingsView'
import { TeamsView } from './views/TeamsView'

const TABS = ['Session', 'Dashboard', 'Matches', 'Teams', 'Settings'] as const
type Tab = (typeof TABS)[number]

/** `#tab=Teams` opens a tab directly (used by the self-test). */
function tabFromHash(): Tab | null {
  const m = window.location.hash.match(/tab=([^&]+)/)
  const tab = m ? decodeURIComponent(m[1]) : null
  return TABS.includes(tab as Tab) ? (tab as Tab) : null
}

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [tab, setTab] = useState<Tab | null>(tabFromHash())
  /** Past session picked on the dashboard; null = the live one, else the latest. */
  const [openSession, setOpenSession] = useState<string | null>(null)

  useEffect(() => {
    const load = () => void window.api.getState().then(setState)
    load()
    const offState = window.api.onStateChanged(load)
    const offSound = window.api.onSound(playSound)
    const onHash = () => {
      const t = tabFromHash()
      if (t) setTab(t)
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      offState()
      offSound()
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  if (!state) return <div className="empty">Loading…</div>
  if (state.needsSetup) return <Setup settings={state.settings} />

  const { data, settings } = state
  const live = activeSession(data)
  // Default: the live session if there is one, else the long-term dashboard
  const current = tab ?? (live ? 'Session' : 'Dashboard')
  const shownSession =
    data.sessions.find((s) => s.id === openSession) ?? live ?? data.sessions[data.sessions.length - 1] ?? null
  const h = settings.hotkeys
  const liveText = live
    ? sessionSummaries(sessionMatches(data, live.id))
        .map((s) => `${s.mode} ${s.wins}–${s.losses} ${signed(s.mmrDelta)}`)
        .join(' · ')
    : ''

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          RL <span>Session</span> Tracker
        </div>
        <div className="day-status">
          <span className={`dot ${live ? 'live' : ''}`} />
          {live ? `Live since ${formatTime(live.startedAt)}${liveText ? ` · ${liveText}` : ''}` : 'No active session'}
        </div>
        <div className="spacer" />
        <div className="actions">
          <button onClick={() => void window.api.capture()}>
            Read screen<kbd>{h.capture}</kbd>
          </button>
          <button onClick={() => void window.api.importImage()}>Import image</button>
          {live ? (
            <button onClick={() => void window.api.endSession()}>
              End session<kbd>{h.session}</kbd>
            </button>
          ) : (
            <button className="accent" onClick={() => void window.api.startSession()}>
              Start session<kbd>{h.session}</kbd>
            </button>
          )}
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={current === t ? 'active' : ''}
            onClick={() => {
              setTab(t)
              if (t === 'Session') setOpenSession(null)
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="content">
        <UpdateBanner update={state.update} sessionLive={!!live} />
        {state.notice && <div className="banner warn">{state.notice}</div>}
        {state.hotkeyError && current !== 'Settings' && <div className="banner error">{state.hotkeyError}</div>}
        {current === 'Session' && <SessionView data={data} session={shownSession} settings={settings} />}
        {current === 'Dashboard' && (
          <Dashboard
            data={data}
            settings={settings}
            onOpenSession={(id) => {
              setOpenSession(id)
              setTab('Session')
            }}
          />
        )}
        {current === 'Matches' && <MatchesView data={data} />}
        {current === 'Teams' && <TeamsView data={data} />}
        {current === 'Settings' && (
          <SettingsView settings={settings} hotkeyError={state.hotkeyError} dataDir={state.dataDir} appVersion={state.appVersion} update={state.update} />
        )}
      </div>
    </div>
  )
}
