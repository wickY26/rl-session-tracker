import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/api'

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Update checks against the GitHub releases (electron-builder `publish` config).
 * Nothing happens without the user: download and install are separate clicks, and the app
 * never restarts on its own — a session in progress is never interrupted.
 */
export class Updater {
  private current: UpdateState = { status: 'idle' }

  constructor(
    private readonly onChange: () => void,
    /** Called right before quitting to install, so the window's hide-to-tray handler lets go. */
    private readonly beforeInstall: () => void
  ) {}

  state(): UpdateState {
    return this.current
  }

  private set(next: UpdateState): void {
    this.current = next
    this.onChange()
  }

  start(): void {
    // Development runs have no release to compare with
    if (!app.isPackaged) return
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => {
      // Don't flash "checking" over an update that is already waiting
      if (this.current.status === 'idle' || this.current.status === 'error') this.set({ status: 'checking' })
    })
    autoUpdater.on('update-available', (info) => this.set({ status: 'available', version: info.version }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'idle' }))
    autoUpdater.on('download-progress', (p) => {
      const version = 'version' in this.current ? this.current.version : ''
      this.set({ status: 'downloading', version, percent: Math.round(p.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version }))
    autoUpdater.on('error', (err) => this.set({ status: 'error', message: err.message }))
    void this.check()
    setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return
    // Already have one waiting: no need to ask again
    if (this.current.status === 'downloading' || this.current.status === 'ready') return
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.set({ status: 'error', message: (err as Error).message })
    }
  }

  async download(): Promise<void> {
    if (this.current.status !== 'available') return
    this.set({ status: 'downloading', version: this.current.version, percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.set({ status: 'error', message: (err as Error).message })
    }
  }

  install(): void {
    if (this.current.status !== 'ready') return
    this.beforeInstall()
    autoUpdater.quitAndInstall(false, true)
  }
}
