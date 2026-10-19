import type { NewMatch, Settings, TrackerData } from '../core/types'
import type { ScoreboardReading } from '../ocr/types'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export interface AppState {
  data: TrackerData
  settings: Settings
  dataDir: string
  /** Set when a hotkey couldn't be registered (another app owns it, or invalid). */
  hotkeyError: string | null
  /** One-off notice, e.g. data restored from the backup copy. */
  notice: string | null
  /** No account name yet: show the first-run setup. */
  needsSetup: boolean
  appVersion: string
  update: UpdateState
}

export type ConfirmPayload =
  | { status: 'reading'; image: string | null }
  | { status: 'error'; image: string | null; error: string }
  /** No MMR on the scoreboard: casual match, nothing to save. */
  | { status: 'casual'; image: string | null }
  | { status: 'ready'; image: string | null; reading: ScoreboardReading }
  /** Editing a saved match. */
  | { status: 'edit'; image: string | null; matchId: string; match: NewMatch }

/** The card never takes focus, so keyboard commands arrive through global hotkeys. */
export type ConfirmCommand = 'save' | 'cancel'

export type SoundName = 'capture' | 'ready' | 'saved' | 'error' | 'undo'

export interface SaveResult {
  ok: boolean
  /** Problems that blocked saving (when ok is false). */
  errors: string[]
}

export interface Api {
  getState(): Promise<AppState>
  startSession(): Promise<void>
  endSession(): Promise<void>
  capture(): Promise<void>
  importImage(): Promise<void>
  editMatch(id: string): Promise<void>
  deleteMatch(id: string): Promise<void>
  setTeamTracked(key: string, tracked: boolean): Promise<void>
  openDataDir(): Promise<void>
  updateSettings(settings: Settings): Promise<void>
  checkForUpdate(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onStateChanged(cb: () => void): () => void
  onSound(cb: (sound: SoundName) => void): () => void
  playSound(sound: SoundName): void
  // confirm card
  onConfirmPayload(cb: (payload: ConfirmPayload) => void): () => void
  onConfirmCommand(cb: (cmd: ConfirmCommand) => void): () => void
  confirmReady(): void
  saveMatch(match: NewMatch, editId: string | null): Promise<SaveResult>
  closeConfirm(): void
}

declare global {
  interface Window {
    api: Api
  }
}
