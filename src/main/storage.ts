import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyData } from '../core/sessions'
import { DEFAULT_SETTINGS, type Settings, type TrackerData } from '../core/types'

export interface LoadedData {
  data: TrackerData
  /** tracker.json was unreadable and the .bak copy was used. */
  recoveredFromBackup: boolean
}

/**
 * JSON file store:
 *   data/settings.json
 *   data/tracker.json      (+ tracker.json.bak — the previous version, kept on every write)
 *   data/screenshots/<matchId>.jpg
 * Every write goes to a .tmp file first and is renamed over the target.
 */
export class Storage {
  readonly screenshotDir: string

  constructor(readonly dir: string) {
    this.screenshotDir = join(dir, 'screenshots')
    for (const d of [dir, this.screenshotDir]) mkdirSync(d, { recursive: true })
  }

  private parse<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  }

  private write(file: string, value: unknown): void {
    const path = join(this.dir, file)
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2))
    if (existsSync(path)) copyFileSync(path, `${path}.bak`)
    renameSync(tmp, path)
  }

  loadSettings(): Settings {
    const path = join(this.dir, 'settings.json')
    let saved: Partial<Settings> = {}
    try {
      if (existsSync(path)) saved = this.parse<Partial<Settings>>(path)
    } catch {
      // Unreadable settings fall back to defaults; tracking data is unaffected
    }
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...saved.hotkeys },
      overlay: { ...DEFAULT_SETTINGS.overlay, ...saved.overlay },
      startingMmr: { ...saved.startingMmr }
    }
  }

  saveSettings(settings: Settings): void {
    this.write('settings.json', settings)
  }

  /**
   * Loads tracker.json; falls back to the .bak copy when it is corrupt.
   * Throws when neither is readable, so the caller never overwrites data it couldn't read.
   */
  loadData(): LoadedData {
    const path = join(this.dir, 'tracker.json')
    if (!existsSync(path)) return { data: emptyData(), recoveredFromBackup: false }
    try {
      return { data: this.checkVersion(this.parse<TrackerData>(path)), recoveredFromBackup: false }
    } catch (err) {
      const bak = `${path}.bak`
      if (!existsSync(bak)) throw new Error(`tracker.json is unreadable: ${(err as Error).message}`)
      return { data: this.checkVersion(this.parse<TrackerData>(bak)), recoveredFromBackup: true }
    }
  }

  private checkVersion(data: TrackerData): TrackerData {
    if (data.schemaVersion !== 1) {
      throw new Error(`tracker.json has schema version ${String(data.schemaVersion)}; this app reads version 1`)
    }
    return data
  }

  saveData(data: TrackerData): void {
    this.write('tracker.json', data)
  }

  screenshotPath(matchId: string): string {
    return join(this.screenshotDir, `${matchId}.jpg`)
  }

  /** Relative path stored on the match. */
  screenshotRef(matchId: string): string {
    return `screenshots/${matchId}.jpg`
  }

  saveScreenshot(matchId: string, jpeg: Buffer): string {
    writeFileSync(this.screenshotPath(matchId), jpeg)
    return this.screenshotRef(matchId)
  }

  deleteScreenshot(ref: string | null): void {
    if (!ref) return
    const path = join(this.dir, ref)
    if (existsSync(path)) rmSync(path)
  }
}
