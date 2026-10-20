import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Windows app ID of the installed app; the taskbar and notifications take their icon from its Start Menu shortcut. */
export const APP_ID = 'com.rlsessiontracker.app'
/**
 * Dev runs and self-tests use their own ID. When Electron shows a notification it creates a Start Menu
 * shortcut for the app ID if none exists — with the same ID, a dev run left "Electron.lnk" (default
 * Electron logo) registered for the installed app, and that logo showed up on its taskbar entry.
 */
export const DEV_APP_ID = 'com.rlsessiontracker.app.dev'

/**
 * Whether this is the installed app: packaged and set up by the installer, which puts its uninstaller
 * next to the exe. The unpacked test build (release/win-unpacked) is packaged too but must not claim the
 * real app ID or rewrite the Start Menu shortcut.
 */
export function isInstalledCopy(): boolean {
  return app.isPackaged && existsSync(join(dirname(process.execPath), 'Uninstall RL Session Tracker.exe'))
}

export function appId(isRealInstall: boolean): string {
  return isRealInstall ? APP_ID : DEV_APP_ID
}

/**
 * Makes sure the Start Menu shortcut of the installed app points at this exe with our app ID and icon.
 * It can be missing or stale (a test build created it, the install folder moved); Windows then shows
 * the wrong icon on the taskbar and in notifications. Only rewrites when something differs.
 */
export function repairStartMenuShortcut(): void {
  if (process.platform !== 'win32' || !isInstalledCopy()) return
  // Same name the installer gives it (electron-builder productName)
  const lnk = join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'RL Session Tracker.lnk')
  const exe = process.execPath
  let current: Electron.ShortcutDetails | null = null
  try {
    if (existsSync(lnk)) current = shell.readShortcutLink(lnk)
  } catch {
    current = null
  }
  const same = (a?: string) => (a ?? '').toLowerCase() === exe.toLowerCase()
  if (current && same(current.target) && same(current.icon) && current.appUserModelId === APP_ID) return
  shell.writeShortcutLink(lnk, current ? 'replace' : 'create', {
    target: exe,
    cwd: join(exe, '..'),
    description: 'RL Session Tracker',
    icon: exe,
    iconIndex: 0,
    appUserModelId: APP_ID,
    // Keep the toast activator Windows already knows, if there is one
    ...(current?.toastActivatorClsid ? { toastActivatorClsid: current.toastActivatorClsid } : {})
  })
}
