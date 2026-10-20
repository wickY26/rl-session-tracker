import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray, type NativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  activeSession,
  addMatch,
  closeIdleSession,
  deleteMatch,
  endSession,
  lastMatch,
  sessionMatches,
  startSession,
  updateMatch
} from '../core/sessions'
import { isWin, myLine, sessionSummaries } from '../core/stats'
import { setTeamTracked } from '../core/teams'
import type { Match, NewMatch, Settings, TrackerData } from '../core/types'
import { matchErrors, missingFields } from '../core/validate'
import templates from '../ocr/digit-templates.json'
import { ScoreboardReader } from '../ocr/reader'
import type { AppState, ConfirmCommand, ConfirmPayload, SaveResult, SoundName } from '../shared/api'
// .ico on purpose: Windows picks the right size for the tray (16), title bar and taskbar
import iconPath from '../../resources/icon.ico?asset'
import { grabScreen, snapTeammates } from './capture'
import { applyOverlay, overlayWindow } from './overlay'
import { Storage } from './storage'
import { Updater } from './updater'

app.setAppUserModelId('com.rlsessiontracker.app')
// Sounds play from a hidden window without a user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
/**
 * Self-test (development / package check):
 *   RLST_SELFTEST=<img1,img2> RLST_SELFTEST_OUT=<dir> RLST_SELFTEST_ACCOUNT=<name>
 *   optional: RLST_SELFTEST_DATA=<tracker.json to start from>  RLST_SELFTEST_TABS=Session,Dashboard,…
 * Runs in a separate data folder, so an installed, running app is not affected.
 */
const selftest = process.env.RLST_SELFTEST
const selftestOut = process.env.RLST_SELFTEST_OUT
if (selftest && selftestOut) app.setPath('userData', join(selftestOut, 'userdata'))
if (!selftest && !app.requestSingleInstanceLock()) app.quit()

let storage: Storage
let data: TrackerData
let settings: Settings
let reader: ScoreboardReader
let hotkeyError: string | null = null
let updater: Updater
let notice: string | null = null

let mainWindow: BrowserWindow | null = null
let confirmWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trayHintShown = false

let confirmLoaded = false
let pendingPayload: ConfirmPayload | null = null
/** Screenshot of the match waiting on the card (written to disk on save). */
let pendingShot: Buffer | null = null
let reading = false
let undoArmedUntil = 0

const newId = () => `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
const needsSetup = () => !settings.accountName.trim()

function langPath(): string {
  return join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')
}

// ---------------------------------------------------------------------------
// Windows

function loadRenderer(win: BrowserWindow, hash = ''): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}#${hash}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

const preload = () => join(__dirname, '../preload/index.js')

function createMainWindow(show: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show,
    title: 'RL Session Tracker',
    icon: iconPath,
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
    // Keeps playing sounds while hidden
    webPreferences: { preload: preload(), backgroundThrottling: false }
  })
  loadRenderer(mainWindow)
  // External links open in the browser, not in an Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Closing hides to the tray; hotkeys keep working
  mainWindow.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    mainWindow?.hide()
    if (!trayHintShown) {
      trayHintShown = true
      notify('RL Session Tracker is still running', 'Hotkeys stay active. Right-click the tray icon → Quit to close it.')
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function ensureConfirmWindow(): BrowserWindow {
  if (confirmWindow && !confirmWindow.isDestroyed()) return confirmWindow
  confirmLoaded = false
  confirmWindow = new BrowserWindow({
    width: 1040,
    height: 680,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Confirm match',
    icon: iconPath,
    backgroundColor: '#0b0f17',
    webPreferences: { preload: preload() }
  })
  // Stay above the (borderless fullscreen) game
  confirmWindow.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(confirmWindow, 'confirm')
  confirmWindow.on('closed', () => {
    confirmWindow = null
    confirmLoaded = false
  })
  return confirmWindow
}

function confirmVisible(): boolean {
  return !!confirmWindow && !confirmWindow.isDestroyed() && confirmWindow.isVisible()
}

/**
 * Shows the confirm card WITHOUT taking focus: focus stays in the game, so it doesn't minimize.
 * Save/cancel come from global hotkeys (F8/F7); clicking the card makes it editable.
 */
function showConfirm(payload: ConfirmPayload, focus = false): void {
  const win = ensureConfirmWindow()
  pendingPayload = payload
  if (confirmLoaded) win.webContents.send('confirm:payload', payload)
  if (!win.isVisible()) {
    // Top-right of the screen the game runs on (where the cursor is)
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const [w] = win.getSize()
    win.setPosition(Math.round(display.workArea.x + display.workArea.width - w - 24), Math.round(display.workArea.y + 24))
  }
  if (focus) {
    win.show()
    win.focus()
  } else {
    win.showInactive()
  }
  win.moveTop()
  setCancelHotkey(true)
}

function hideConfirm(): void {
  pendingShot = null
  pendingPayload = null
  confirmWindow?.hide()
  setCancelHotkey(false)
}

function sendConfirmCommand(cmd: ConfirmCommand): void {
  confirmWindow?.webContents.send('confirm:command', cmd)
}

function broadcastState(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('state:changed')
  updateTrayMenu()
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body, silent: true, icon: iconPath }).show()
}

function sound(name: SoundName): void {
  if (settings.sounds) mainWindow?.webContents.send('sound', name)
}

function persist(next: TrackerData): void {
  data = next
  storage.saveData(data)
  broadcastState()
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function describeMatch(m: Match | NewMatch): string {
  const me = myLine(m as Match)
  const result = isWin(m as Match) ? 'Win' : 'Loss'
  const mmr = me.mmr !== null && me.mmrDelta !== null ? ` · ${signed(me.mmrDelta)} (${me.mmr})` : ''
  return `${result} · ${m.mode}${mmr}`
}

// ---------------------------------------------------------------------------
// Capture + OCR

const toDataUrl = (image: NativeImage) => image.resize({ width: 1100 }).toDataURL()

async function readImage(image: NativeImage): Promise<void> {
  if (reading) return
  if (image.isEmpty()) {
    sound('error')
    showConfirm({ status: 'error', image: null, error: 'The screenshot came back empty. Is the game in Borderless mode?' })
    return
  }
  reading = true
  const preview = toDataUrl(image)
  pendingShot = image.toJPEG(85)
  showConfirm({ status: 'reading', image: preview })
  try {
    const result = await reader.read(image.toPNG())
    if (result.fatal) {
      sound('error')
      showConfirm({
        status: 'error',
        image: preview,
        error: `${result.fatal}. Try again while the scoreboard is on screen (${settings.hotkeys.capture}).`
      })
    } else if (result.casual) {
      sound('error')
      showConfirm({ status: 'casual', image: preview })
    } else {
      sound(result.warnings.length ? 'error' : 'ready')
      showConfirm({ status: 'ready', image: preview, reading: snapTeammates(result, data.matches) })
    }
  } catch (err) {
    sound('error')
    showConfirm({ status: 'error', image: preview, error: `Reading failed: ${(err as Error).message}. Try again.` })
  } finally {
    reading = false
  }
}

async function captureAndRead(): Promise<void> {
  if (reading) return
  if (needsSetup()) {
    showMainWindow()
    return
  }
  sound('capture')
  try {
    await readImage(await grabScreen())
  } catch (err) {
    sound('error')
    showConfirm({ status: 'error', image: null, error: `Screen capture failed: ${(err as Error).message}` })
  }
}

/** F8: reads the screen when no card is open; saves the card when a read card is open. */
function onCaptureHotkey(): void {
  if (reading) return
  const status = confirmVisible() ? pendingPayload?.status : undefined
  if (status === 'ready' || status === 'edit') sendConfirmCommand('save')
  else if (status === 'casual' || status === 'error') hideConfirm()
  else void captureAndRead()
}

function saveMatch(input: NewMatch, editId: string | null): SaveResult {
  const errors = matchErrors(input)
  if (errors.length) {
    sound('error')
    return { ok: false, errors }
  }
  if (editId) {
    const existing = data.matches.find((m) => m.id === editId)
    persist(updateMatch(data, editId, { ...input, screenshot: existing?.screenshot ?? null }))
  } else {
    const now = new Date()
    const before = activeSession(closeIdleSession(data, now, settings.sessionIdleMinutes))
    let { data: next, match } = addMatch(data, { ...input, screenshot: null }, now, settings.sessionIdleMinutes, newId)
    if (pendingShot && settings.keepScreenshots) {
      const ref = storage.saveScreenshot(match.id, pendingShot)
      next = { ...next, matches: next.matches.map((m) => (m.id === match.id ? { ...m, screenshot: ref } : m)) }
    }
    persist(next)
    const missing = missingFields(match).length
    notify(
      'Match saved',
      `${describeMatch(match)}${before ? '' : ' · New session started'}${missing ? ` · ${missing} unread value${missing === 1 ? '' : 's'} to review later` : ''}`
    )
  }
  sound('saved')
  hideConfirm()
  return { ok: true, errors: [] }
}

function removeMatch(id: string): void {
  const match = data.matches.find((m) => m.id === id)
  if (!match) return
  persist(deleteMatch(data, id))
  storage.deleteScreenshot(match.screenshot)
}

// ---------------------------------------------------------------------------
// Sessions

function sessionText(sessionId: string): string {
  const summaries = sessionSummaries(sessionMatches(data, sessionId))
  return summaries.map((s) => `${s.mode} ${s.wins}W–${s.losses}L ${signed(s.mmrDelta)}`).join(' · ') || 'No matches'
}

function doStartSession(): void {
  if (activeSession(data)) return
  persist(startSession(data, new Date(), settings.sessionIdleMinutes, newId))
  sound('saved')
  notify('Session started', `Good luck! Press ${settings.hotkeys.capture} on the scoreboard after each match.`)
}

function doEndSession(): void {
  const session = activeSession(data)
  if (!session) return
  const text = sessionText(session.id)
  persist(endSession(data, new Date()))
  sound('saved')
  notify('Session ended', text)
}

function toggleSession(): void {
  if (activeSession(data)) doEndSession()
  else doStartSession()
}

/** Closes the active session once nothing was saved for the configured idle time. */
function checkIdle(): void {
  const session = activeSession(data)
  if (!session) return
  const next = closeIdleSession(data, new Date(), settings.sessionIdleMinutes)
  if (next === data) return
  const text = sessionText(session.id)
  persist(next)
  notify('Session closed', `No match for ${settings.sessionIdleMinutes} min · ${text}`)
}

/** Ctrl+F7: removes the last match. Must be pressed twice within 5 s so it can't happen by accident. */
function undoHotkey(): void {
  const last = lastMatch(data)
  if (!last) {
    sound('error')
    notify('Nothing to undo', '')
    return
  }
  if (Date.now() > undoArmedUntil) {
    undoArmedUntil = Date.now() + 5000
    sound('error')
    notify('Remove the last match?', `${describeMatch(last)} — press ${settings.hotkeys.undo} again within 5 s.`)
    return
  }
  undoArmedUntil = 0
  removeMatch(last.id)
  sound('undo')
  notify('Last match removed', describeMatch(last))
}

function refreshOverlay(): void {
  applyOverlay(settings, (w) => loadRenderer(w, 'overlay'), preload())
}

/** F10: shows / hides the overlay (remembered in settings). */
function toggleOverlay(): void {
  settings = { ...settings, overlay: { ...settings.overlay, enabled: !settings.overlay.enabled } }
  storage.saveSettings(settings)
  refreshOverlay()
  broadcastState()
}

// ---------------------------------------------------------------------------
// Hotkeys, autostart, tray

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  const reg = (accel: string, fn: () => void) => {
    try {
      if (!globalShortcut.register(accel, fn)) failed.push(accel)
    } catch {
      failed.push(accel)
    }
  }
  reg(settings.hotkeys.capture, onCaptureHotkey)
  reg(settings.hotkeys.session, toggleSession)
  reg(settings.hotkeys.undo, undoHotkey)
  reg(settings.hotkeys.overlay, toggleOverlay)
  if (confirmVisible()) setCancelHotkey(true)
  hotkeyError = failed.length ? `Couldn't register hotkey ${failed.join(', ')} (used by another app, or invalid)` : null
}

/** The cancel hotkey is only registered while the card is open, so it isn't taken from the game. */
function setCancelHotkey(on: boolean): void {
  const accel = settings.hotkeys.cancel
  try {
    if (on && !globalShortcut.isRegistered(accel)) globalShortcut.register(accel, () => sendConfirmCommand('cancel'))
    if (!on && globalShortcut.isRegistered(accel)) globalShortcut.unregister(accel)
  } catch {
    // Invalid accelerator: surfaces as hotkeyError in settings
  }
}

function applyAutoStart(): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: settings.autostart, args: ['--hidden'] })
}

function state(): AppState {
  return {
    data,
    settings,
    dataDir: storage.dir,
    hotkeyError,
    notice,
    needsSetup: needsSetup(),
    appVersion: app.getVersion(),
    update: updater.state()
  }
}

function updateTrayMenu(): void {
  if (!tray) return
  const session = activeSession(data)
  const h = settings.hotkeys
  tray.setToolTip(`RL Session Tracker${session ? ` · ${sessionText(session.id)}` : ''}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open RL Session Tracker', click: showMainWindow },
      { type: 'separator' },
      { label: `Read screen (${h.capture})`, click: () => void captureAndRead() },
      session
        ? { label: `End session (${h.session})`, click: doEndSession }
        : { label: `Start session (${h.session})`, click: doStartSession },
      { label: 'Undo last match', enabled: data.matches.length > 0, click: undoHotkey },
      { label: `${settings.overlay.enabled ? 'Hide' : 'Show'} overlay (${h.overlay})`, click: toggleOverlay },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.on('click', showMainWindow)
  updateTrayMenu()
}

// ---------------------------------------------------------------------------
// IPC

function registerIpc(): void {
  ipcMain.handle('state:get', (e) => {
    const s = state()
    // The notice is shown once, in the main window (the overlay and the card ask for state too)
    if (e.sender === mainWindow?.webContents) notice = null
    return s
  })
  ipcMain.handle('session:start', () => doStartSession())
  ipcMain.handle('session:end', () => doEndSession())
  ipcMain.handle('capture', () => captureAndRead())
  ipcMain.handle('import', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Pick a scoreboard screenshot',
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return
    await readImage(nativeImage.createFromPath(res.filePaths[0]))
  })
  ipcMain.handle('match:edit', (_e, id: string) => {
    const match = data.matches.find((m) => m.id === id)
    if (!match) return
    const shot = match.screenshot ? join(storage.dir, match.screenshot) : null
    const image = shot && existsSync(shot) ? toDataUrl(nativeImage.createFromPath(shot)) : null
    pendingShot = null
    const { id: _id, recordedAt: _at, sessionId: _s, ...rest } = match
    // Edited from inside the app: the card may take focus
    showConfirm({ status: 'edit', image, matchId: id, match: rest }, true)
  })
  ipcMain.handle('match:delete', (_e, id: string) => removeMatch(id))
  ipcMain.handle('team:track', (_e, key: string, tracked: boolean) => persist(setTeamTracked(data, key, tracked)))
  ipcMain.handle('data:open', () => shell.openPath(storage.dir))
  ipcMain.handle('settings:update', (_e, next: Settings) => {
    setCancelHotkey(false)
    const accountChanged = next.accountName !== settings.accountName
    settings = next
    storage.saveSettings(settings)
    if (accountChanged) reader.setAccountName(settings.accountName)
    registerHotkeys()
    applyAutoStart()
    refreshOverlay()
    broadcastState()
  })
  ipcMain.handle('update:check', () => updater.check())
  ipcMain.handle('update:download', () => updater.download())
  ipcMain.handle('update:install', () => updater.install())
  ipcMain.on('sound:play', (_e, name: SoundName) => sound(name))
  ipcMain.on('confirm:ready', () => {
    confirmLoaded = true
    if (pendingPayload) confirmWindow?.webContents.send('confirm:payload', pendingPayload)
  })
  ipcMain.on('confirm:close', () => hideConfirm())
  ipcMain.handle('match:save', (_e, match: NewMatch, editId: string | null) => saveMatch(match, editId))
}

// ---------------------------------------------------------------------------

async function runSelftest(images: string, out: string): Promise<void> {
  const snap = async (win: BrowserWindow | null, name: string) => {
    if (win) writeFileSync(join(out, name), (await win.webContents.capturePage()).toPNG())
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  try {
    await wait(1500)
    for (const [i, file] of images.split(',').filter((f) => existsSync(f)).entries()) {
      await readImage(nativeImage.createFromPath(file))
      await wait(1500)
      await snap(confirmWindow, `confirm-${i}.png`)
      console.log('SELFTEST CARD', pendingPayload?.status)
      // Same path as pressing F8 in game: the card saves through IPC
      if (pendingPayload?.status === 'ready') {
        sendConfirmCommand('save')
        await wait(800)
      } else hideConfirm()
    }
    const overlay = overlayWindow()
    if (overlay) {
      await wait(800)
      writeFileSync(join(out, 'overlay.png'), (await overlay.webContents.capturePage()).toPNG())
    }
    mainWindow?.show()
    // Tall enough to see more than the first screen of a tab
    if (process.env.RLST_SELFTEST_HEIGHT) mainWindow?.setContentSize(1280, Number(process.env.RLST_SELFTEST_HEIGHT))
    for (const tab of (process.env.RLST_SELFTEST_TABS ?? 'Session').split(',')) {
      loadRenderer(mainWindow!, `tab=${encodeURIComponent(tab)}`)
      await wait(1500)
      await snap(mainWindow, `main-${tab}.png`)
    }
    writeFileSync(join(out, 'tracker.json'), JSON.stringify(data, null, 2))
    console.log('SELFTEST OK', data.matches.length, 'matches')
  } catch (err) {
    console.log('SELFTEST FAIL', (err as Error).stack)
  } finally {
    quitting = true
    app.exit(0)
  }
}

void app.whenReady().then(() => {
  const dataDir = join(app.getPath('userData'), 'data')
  if (selftest && process.env.RLST_SELFTEST_DATA) {
    mkdirSync(dataDir, { recursive: true })
    copyFileSync(process.env.RLST_SELFTEST_DATA, join(dataDir, 'tracker.json'))
  }
  storage = new Storage(dataDir)
  settings = storage.loadSettings()
  if (selftest) settings = { ...settings, accountName: process.env.RLST_SELFTEST_ACCOUNT ?? settings.accountName }
  try {
    const loaded = storage.loadData()
    data = loaded.data
    if (loaded.recoveredFromBackup) notice = 'tracker.json was damaged — your data was restored from the backup copy.'
  } catch (err) {
    // Never start empty over data we couldn't read: that would overwrite it on the next save
    dialog.showErrorBox('RL Session Tracker', `Your data couldn't be read and the app will close.\n\n${(err as Error).message}\n\nFolder: ${storage.dir}`)
    app.exit(1)
    return
  }
  updater = new Updater(broadcastState, () => {
    quitting = true
  })
  reader = new ScoreboardReader({ langPath: langPath(), accountName: settings.accountName, templates })
  void reader.warmUp()
  registerIpc()
  if (!selftest) {
    registerHotkeys()
    applyAutoStart()
    createTray()
    setInterval(checkIdle, 60_000)
    checkIdle()
    updater.start()
  }
  if (!needsSetup()) refreshOverlay()
  createMainWindow((!process.argv.includes('--hidden') || needsSetup()) && !selftest)
  if (selftest && selftestOut) void runSelftest(selftest, selftestOut)
})

app.on('second-instance', showMainWindow)

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  void reader?.dispose()
})
