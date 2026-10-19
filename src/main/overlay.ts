import { BrowserWindow, screen } from 'electron'
import type { Settings } from '../core/types'

/** Size of the overlay at scale 1; the content is zoomed by `settings.overlay.scale`. */
const BASE_W = 380
const BASE_H = 96

let win: BrowserWindow | null = null

/**
 * Where the overlay goes: a corner of the primary display (where the game runs in Borderless)
 * plus the configured offset.
 */
function bounds(o: Settings['overlay']): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().bounds
  const width = Math.round(BASE_W * o.scale)
  const height = Math.round(BASE_H * o.scale)
  const left = o.corner.endsWith('left')
  const top = o.corner.startsWith('top')
  return {
    x: Math.round(left ? area.x + o.offsetX : area.x + area.width - width - o.offsetX),
    y: Math.round(top ? area.y + o.offsetY : area.y + area.height - height - o.offsetY),
    width,
    height
  }
}

function create(load: (w: BrowserWindow) => void, preload: string): BrowserWindow {
  const w = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    title: 'RL Session Tracker overlay',
    webPreferences: { preload, backgroundThrottling: false }
  })
  // Above the borderless game, never takes clicks, and left out of our own screen captures
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setIgnoreMouseEvents(true)
  w.setContentProtection(true)
  w.on('closed', () => {
    win = null
  })
  load(w)
  return w
}

/** Shows, moves and styles the overlay to match the settings; hides it when disabled. */
export function applyOverlay(settings: Settings, load: (w: BrowserWindow) => void, preload: string): void {
  const o = settings.overlay
  if (!o.enabled) {
    win?.hide()
    return
  }
  win ??= create(load, preload)
  win.setBounds(bounds(o))
  win.setOpacity(Math.min(1, Math.max(0.2, o.opacity)))
  const zoom = o.scale
  const target = win
  const applyZoom = () => target.webContents.setZoomFactor(zoom)
  if (target.webContents.isLoading()) target.webContents.once('did-finish-load', applyZoom)
  else applyZoom()
  if (!win.isVisible()) win.showInactive()
  win.moveTop()
}

export function overlayWindow(): BrowserWindow | null {
  return win
}
