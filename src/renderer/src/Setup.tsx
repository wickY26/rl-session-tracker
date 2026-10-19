import { useState } from 'react'
import { MODES, type Mode, type Settings } from '../../core/types'
import { IntInput } from './components/IntInput'

/** First run: the account name is required to find "me" on the scoreboard. */
export function Setup({ settings }: { settings: Settings }) {
  const [accountName, setAccountName] = useState(settings.accountName)
  const [startingMmr, setStartingMmr] = useState<Partial<Record<Mode, number>>>(settings.startingMmr)
  const [saving, setSaving] = useState(false)
  const h = settings.hotkeys

  const save = async () => {
    if (!accountName.trim() || saving) return
    setSaving(true)
    await window.api.updateSettings({ ...settings, accountName: accountName.trim(), startingMmr })
    setSaving(false)
  }

  return (
    <div className="setup">
      <h1>Welcome to RL Session Tracker</h1>
      <p className="sub">Two quick things before your first session.</p>

      <div className="section">
        <div className="section-body">
          <div className="field">
            <label htmlFor="account">
              <strong>Your Rocket League name</strong> — exactly as it shows on the scoreboard (without club tag)
            </label>
            <input
              id="account"
              autoFocus
              placeholder="e.g. wickY26"
              className={accountName.trim() ? '' : 'invalid'}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
          </div>
          <div className="field">
            <span>
              <strong>Current MMR</strong> <span className="sub">(optional — your first competitive screenshot fills it anyway)</span>
            </span>
            <div className="modes">
              {MODES.map((mode) => (
                <label key={mode}>
                  {mode}
                  <IntInput
                    value={startingMmr[mode] ?? null}
                    onChange={(v) => setStartingMmr((s) => {
                      const next = { ...s }
                      if (v === null) delete next[mode]
                      else next[mode] = v
                      return next
                    })}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="banner warn">
        Play Rocket League in <strong>Borderless</strong> window mode — exclusive fullscreen captures come out black.
      </div>
      <p className="sub">
        After each competitive match, with the scoreboard on screen: <kbd>{h.capture}</kbd> reads it, <kbd>{h.capture}</kbd> again
        saves, <kbd>{h.cancel}</kbd> cancels. <kbd>{h.session}</kbd> starts / ends a session.
      </p>
      <button className="primary" disabled={!accountName.trim() || saving} onClick={() => void save()}>
        Start tracking
      </button>
    </div>
  )
}
