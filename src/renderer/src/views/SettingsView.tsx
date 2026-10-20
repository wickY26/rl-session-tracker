import { useEffect, useState } from 'react'
import { MODES, type OverlayCorner, type Settings } from '../../../core/types'
import type { UpdateState } from '../../../shared/api'
import { IntInput } from '../components/IntInput'

const HOTKEY_LABELS: Record<keyof Settings['hotkeys'], string> = {
  capture: 'Read screen / save card',
  cancel: 'Cancel card',
  session: 'Start / end session',
  undo: 'Undo last match (press twice)',
  overlay: 'Show / hide overlay'
}

/** Turns a key press into an Electron accelerator, e.g. Control+Shift+F8. */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const key = e.key
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  const named = /^F\d{1,2}$/.test(key) ? key : key.length === 1 ? key.toUpperCase() : ({ ' ': 'Space', Escape: null } as Record<string, string | null>)[key] ?? key
  if (!named) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean)
  return [...mods, named].join('+')
}

function HotkeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="hotkey"
      readOnly
      value={value}
      title="Click, then press the key combination"
      onKeyDown={(e) => {
        e.preventDefault()
        const accel = toAccelerator(e)
        if (accel) onChange(accel)
      }}
    />
  )
}

const CORNERS: { value: OverlayCorner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' }
]

/** Overlay options apply immediately (no Save needed) so you can place it while looking at the game. */
function OverlaySettings({ settings }: { settings: Settings }) {
  const o = settings.overlay
  const update = (patch: Partial<Settings['overlay']>) => void window.api.updateSettings({ ...settings, overlay: { ...o, ...patch } })
  return (
    <div className="section">
      <header>
        <h2>In-game overlay</h2>
        <span className="hint">
          Changes apply right away · <kbd>{settings.hotkeys.overlay}</kbd> shows / hides it in game
        </span>
      </header>
      <div className="section-body settings-grid">
        <span>Show overlay</span>
        <label className="check">
          <input type="checkbox" checked={o.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> Always on top of the game
          (Borderless mode), clicks pass through
        </label>
        <span>Position</span>
        <div className="inline-fields">
          <select value={o.corner} onChange={(e) => update({ corner: e.target.value as OverlayCorner })}>
            {CORNERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label>
            X
            <IntInput value={o.offsetX} onChange={(v) => v !== null && v >= 0 && update({ offsetX: v })} />
          </label>
          <label>
            Y
            <IntInput value={o.offsetY} onChange={(v) => v !== null && v >= 0 && update({ offsetY: v })} />
          </label>
          <span className="sub">px from the corner</span>
        </div>
        <span>Opacity</span>
        <div className="inline-fields">
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={Math.round(o.opacity * 100)}
            onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
          />
          <span className="sub">{Math.round(o.opacity * 100)}%</span>
        </div>
        <span>Size</span>
        <div className="seg">
          {[0.75, 1, 1.25, 1.5].map((scale) => (
            <button key={scale} className={o.scale === scale ? 'active' : ''} onClick={() => update({ scale })}>
              {Math.round(scale * 100)}%
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function updateText(u: UpdateState): string {
  switch (u.status) {
    case 'checking':
      return 'Checking…'
    case 'available':
      return `Version ${u.version} available (see the banner above)`
    case 'downloading':
      return `Downloading ${u.version}… ${u.percent}%`
    case 'ready':
      return `Version ${u.version} ready — restart to install`
    case 'error':
      return `Last check failed: ${u.message}`
    default:
      return 'Up to date'
  }
}

export function SettingsView(props: {
  settings: Settings
  hotkeyError: string | null
  dataDir: string
  appVersion: string
  update: UpdateState
}) {
  const { settings, hotkeyError, dataDir, appVersion, update } = props
  const [draft, setDraft] = useState(settings)
  const [saved, setSaved] = useState(false)
  // Overlay options save on their own; keep any other unsaved edits in the draft
  useEffect(() => setDraft((d) => ({ ...d, overlay: settings.overlay })), [settings])
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const keys = Object.values(draft.hotkeys)
  const clash = keys.find((k, i) => keys.indexOf(k) !== i) ?? null
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSaved(false)
    setDraft((d) => ({ ...d, [key]: value }))
  }

  const save = async () => {
    if (!draft.accountName.trim()) return
    await window.api.updateSettings({ ...draft, accountName: draft.accountName.trim() })
    setSaved(true)
  }

  return (
    <>
      {hotkeyError && <div className="banner error">{hotkeyError}</div>}
      {clash && <div className="banner error">{clash} is assigned to two actions — pick a different key for one of them.</div>}
      <div className="section">
        <header>
          <h2>Account</h2>
        </header>
        <div className="section-body settings-grid">
          <label htmlFor="acc">Rocket League name</label>
          <input id="acc" className={draft.accountName.trim() ? '' : 'invalid'} value={draft.accountName} onChange={(e) => set('accountName', e.target.value)} />
          <span>Starting MMR</span>
          <div className="inline-fields">
            {MODES.map((mode) => (
              <label key={mode}>
                {mode}
                <IntInput
                  value={draft.startingMmr[mode] ?? null}
                  onChange={(v) => {
                    const next = { ...draft.startingMmr }
                    if (v === null) delete next[mode]
                    else next[mode] = v
                    set('startingMmr', next)
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <header>
          <h2>Sessions</h2>
        </header>
        <div className="section-body settings-grid">
          <label>Close a session after</label>
          <div className="inline-fields">
            <IntInput value={draft.sessionIdleMinutes} onChange={(v) => v !== null && v > 0 && set('sessionIdleMinutes', v)} />
            <span className="sub">minutes without a saved match</span>
          </div>
        </div>
      </div>

      <div className="section">
        <header>
          <h2>Hotkeys</h2>
          <span className="hint">Click a field and press the keys. They work while the game has focus.</span>
        </header>
        <div className="section-body settings-grid">
          {(Object.keys(HOTKEY_LABELS) as (keyof Settings['hotkeys'])[]).map((key) => (
            <div className="contents" key={key}>
              <span>{HOTKEY_LABELS[key]}</span>
              <HotkeyInput value={draft.hotkeys[key]} onChange={(v) => set('hotkeys', { ...draft.hotkeys, [key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <OverlaySettings settings={settings} />

      <div className="section">
        <header>
          <h2>App</h2>
        </header>
        <div className="section-body settings-grid">
          <span>Sounds</span>
          <label className="check">
            <input type="checkbox" checked={draft.sounds} onChange={(e) => set('sounds', e.target.checked)} /> Feedback beeps on capture / save
          </label>
          <span>Screenshots</span>
          <label className="check">
            <input type="checkbox" checked={draft.keepScreenshots} onChange={(e) => set('keepScreenshots', e.target.checked)} /> Keep a screenshot of every
            saved match
          </label>
          <span>Start with Windows</span>
          <label className="check">
            <input type="checkbox" checked={draft.autostart} onChange={(e) => set('autostart', e.target.checked)} /> Start hidden in the tray (installed app
            only)
          </label>
          <span>Updates</span>
          <label className="check">
            <input type="checkbox" checked={draft.checkForUpdates} onChange={(e) => set('checkForUpdates', e.target.checked)} /> Check for
            updates automatically — asks GitHub for a newer release at start-up and every 6 hours; this is the app's only network access
          </label>
          <span>Version</span>
          <div className="inline-fields">
            <span>{appVersion}</span>
            <span className="sub">{updateText(update)}</span>
            <button onClick={() => void window.api.checkForUpdate()} disabled={update.status === 'checking' || update.status === 'downloading'}>
              Check for updates
            </button>
          </div>
          <span>Data folder</span>
          <div className="inline-fields">
            <code className="sub">{dataDir}</code>
            <button onClick={() => void window.api.openDataDir()}>Open</button>
          </div>
        </div>
      </div>

      <div className="save-bar">
        {saved && !dirty && <span className="sub">Saved ✓</span>}
        <button onClick={() => setDraft(settings)} disabled={!dirty}>
          Revert
        </button>
        <button className="primary" onClick={() => void save()} disabled={!dirty || !draft.accountName.trim() || !!clash}>
          Save settings
        </button>
      </div>
    </>
  )
}
