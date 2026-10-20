export const MODES = ['1v1', '2v2', '3v3'] as const
/** Team size: number of rows per team on the scoreboard. */
export type Mode = (typeof MODES)[number]

/** Ranked playlist. Defaults from the mode; extra modes (Hoops, Rumble…) are picked on the confirm card (T21). */
export type Playlist = 'duel' | 'doubles' | 'standard' | 'hoops' | 'rumble' | 'dropshot' | 'snowday'
export const DEFAULT_PLAYLIST: Record<Mode, Playlist> = { '1v1': 'duel', '2v2': 'doubles', '3v3': 'standard' }

export const STAT_KEYS = ['score', 'goals', 'assists', 'saves', 'shots'] as const
export type StatKey = (typeof STAT_KEYS)[number]
/** Averages and other computed stats: always numbers. */
export type Stats = Record<StatKey, number>
/**
 * One player's stats as read from the scoreboard: null where a cell couldn't be read. The match is
 * saved anyway and shows up as "needs review", so nothing has to be typed in during a session.
 */
export type StatLine = Record<StatKey, number | null>

export interface PlayerLine extends StatLine {
  /** Name as read/corrected, club tags and MMR bracket removed; '' when unreadable. */
  name: string
  /** MMR shown in `[905 + 9]` → 905. Null when not readable. */
  mmr: number | null
  /** Change shown in `[905 + 9]` → 9, `[895 - 17]` → -17. */
  mmrDelta: number | null
  /** Green party icon next to the name (premade). */
  party: boolean
}

export interface TeamResult {
  /** Sum of the players' goals; null when one of them is unreadable. */
  goals: number | null
  players: PlayerLine[]
}

/** Where the tracked player sits on the scoreboard. */
export interface PlayerRef {
  team: 0 | 1
  index: number
}

export interface Match {
  id: string
  recordedAt: string
  sessionId: string
  mode: Mode
  playlist: Playlist
  teams: [TeamResult, TeamResult]
  winner: 0 | 1
  me: PlayerRef
  /** Relative path under data/screenshots, null when screenshots are not kept. */
  screenshot: string | null
}

/** A match as it comes from the confirm card, before it is placed in a session. */
export type NewMatch = Omit<Match, 'id' | 'recordedAt' | 'sessionId'>

export interface Session {
  id: string
  startedAt: string
  endedAt: string | null
  endReason: 'manual' | 'idle' | null
}

export interface TrackerData {
  schemaVersion: 1
  sessions: Session[]
  matches: Match[]
  /** Team keys hidden in the Teams tab. Matches are never touched. */
  untrackedTeams: string[]
}

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Settings {
  accountName: string
  startingMmr: Partial<Record<Mode, number>>
  sessionIdleMinutes: number
  hotkeys: { capture: string; cancel: string; session: string; undo: string; overlay: string }
  overlay: { enabled: boolean; corner: OverlayCorner; offsetX: number; offsetY: number; opacity: number; scale: number }
  keepScreenshots: boolean
  autostart: boolean
  sounds: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  accountName: '',
  startingMmr: {},
  sessionIdleMinutes: 120,
  hotkeys: { capture: 'F8', cancel: 'F7', session: 'F9', undo: 'Control+F7', overlay: 'F10' },
  overlay: { enabled: true, corner: 'top-left', offsetX: 16, offsetY: 16, opacity: 0.85, scale: 1 },
  keepScreenshots: true,
  autostart: false,
  sounds: true
}
