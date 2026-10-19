import { sessionMatches } from '../../../core/sessions'
import { ofMode, sessionSummaries } from '../../../core/stats'
import type { Session, Settings, TrackerData } from '../../../core/types'
import { MatchList } from '../components/MatchList'
import { Tiles } from '../components/Tiles'
import { formatDate, formatTime } from '../format'

function duration(from: string, to: string): string {
  const min = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000))
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
}

/** One session: per-mode tiles and matches. MMR is never mixed across modes. */
export function SessionView({ data, session, settings }: { data: TrackerData; session: Session | null; settings: Settings }) {
  const h = settings.hotkeys
  if (!session) {
    return (
      <div className="empty">
        No sessions yet. Press <kbd>{h.session}</kbd> to start one, or just save a match with <kbd>{h.capture}</kbd>.
      </div>
    )
  }
  const live = session.endedAt === null
  const matches = sessionMatches(data, session.id)
  const summaries = sessionSummaries(matches)
  const last = matches.length ? matches[matches.length - 1].recordedAt : session.startedAt

  return (
    <>
      <div className="session-head">
        <div>
          <h2>
            {live ? (
              <>
                <span className="dot live" /> Live session
              </>
            ) : (
              `Session · ${formatDate(session.startedAt)}`
            )}
          </h2>
          <div className="sub">
            {formatTime(session.startedAt)} – {live ? 'now' : formatTime(session.endedAt!)} · {duration(session.startedAt, live ? new Date().toISOString() : session.endedAt!)} ·{' '}
            {matches.length} match{matches.length === 1 ? '' : 'es'}
            {session.endReason === 'idle' && ` · closed after ${settings.sessionIdleMinutes} min idle (last match ${formatTime(last)})`}
          </div>
        </div>
        {live && (
          <button onClick={() => void window.api.endSession()}>
            End session<kbd>{h.session}</kbd>
          </button>
        )}
      </div>

      {!matches.length && (
        <div className="section">
          <div className="empty">
            Session started. After each competitive match press <kbd>{h.capture}</kbd> on the scoreboard.
          </div>
        </div>
      )}

      {summaries.map((s) => (
        <div className="section" key={s.mode}>
          <header>
            <h2>{s.mode}</h2>
            <span className="hint">
              {s.matches} match{s.matches === 1 ? '' : 'es'}
            </span>
          </header>
          <div className="section-body">
            <Tiles summary={s} />
          </div>
          <MatchList matches={ofMode(matches, s.mode)} />
        </div>
      ))}
    </>
  )
}
