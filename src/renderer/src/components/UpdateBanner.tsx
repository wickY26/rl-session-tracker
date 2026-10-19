import type { UpdateState } from '../../../shared/api'

/** Shown when a newer release exists. Download and restart are the user's call, never automatic. */
export function UpdateBanner({ update, sessionLive }: { update: UpdateState; sessionLive: boolean }) {
  if (update.status === 'available') {
    return (
      <div className="banner info update">
        <span>
          Version <strong>{update.version}</strong> is available.
        </span>
        <button className="primary" onClick={() => void window.api.downloadUpdate()}>
          Download
        </button>
      </div>
    )
  }
  if (update.status === 'downloading') {
    return (
      <div className="banner info update">
        <span>
          Downloading {update.version}… {update.percent}%
        </span>
      </div>
    )
  }
  if (update.status === 'ready') {
    return (
      <div className="banner info update">
        <span>
          Version <strong>{update.version}</strong> is ready.{' '}
          {sessionLive ? 'Your session and matches are saved — it continues after the restart.' : 'It installs when you restart.'}
        </span>
        <button className="primary" onClick={() => void window.api.installUpdate()}>
          Restart &amp; install
        </button>
      </div>
    )
  }
  return null
}
