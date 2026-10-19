import type { Match, NewMatch, Session, TrackerData } from './types'

export type IdFactory = () => string

export function emptyData(): TrackerData {
  return { schemaVersion: 1, sessions: [], matches: [], untrackedTeams: [] }
}

export function activeSession(data: TrackerData): Session | null {
  return data.sessions.find((s) => s.endedAt === null) ?? null
}

export function sessionMatches(data: TrackerData, sessionId: string): Match[] {
  return data.matches.filter((m) => m.sessionId === sessionId)
}

/** Time of the session's last saved match, or its start when it has none. */
export function lastActivity(data: TrackerData, session: Session): string {
  const matches = sessionMatches(data, session.id)
  return matches.length ? matches[matches.length - 1].recordedAt : session.startedAt
}

export function isIdle(data: TrackerData, session: Session, now: Date, idleMinutes: number): boolean {
  return now.getTime() - Date.parse(lastActivity(data, session)) > idleMinutes * 60_000
}

function closeSession(data: TrackerData, session: Session, endedAt: string, reason: 'manual' | 'idle'): TrackerData {
  // An empty session carries no information: drop it instead of keeping a 0-match entry
  if (!sessionMatches(data, session.id).length) {
    return { ...data, sessions: data.sessions.filter((s) => s.id !== session.id) }
  }
  return {
    ...data,
    sessions: data.sessions.map((s) => (s.id === session.id ? { ...s, endedAt, endReason: reason } : s))
  }
}

/**
 * Closes the active session when nothing was saved for `idleMinutes`.
 * It ends at its last match, not at the moment the idle timer noticed.
 */
export function closeIdleSession(data: TrackerData, now: Date, idleMinutes: number): TrackerData {
  const session = activeSession(data)
  if (!session || !isIdle(data, session, now, idleMinutes)) return data
  return closeSession(data, session, lastActivity(data, session), 'idle')
}

/** Starts a session unless one is already running (an idle one is closed first). */
export function startSession(data: TrackerData, now: Date, idleMinutes: number, newId: IdFactory): TrackerData {
  const next = closeIdleSession(data, now, idleMinutes)
  if (activeSession(next)) return next
  const session: Session = { id: newId(), startedAt: now.toISOString(), endedAt: null, endReason: null }
  return { ...next, sessions: [...next.sessions, session] }
}

export function endSession(data: TrackerData, now: Date): TrackerData {
  const session = activeSession(data)
  return session ? closeSession(data, session, now.toISOString(), 'manual') : data
}

/** Saves a match into the active session, starting one when needed. */
export function addMatch(
  data: TrackerData,
  input: NewMatch,
  now: Date,
  idleMinutes: number,
  newId: IdFactory
): { data: TrackerData; match: Match } {
  const started = startSession(data, now, idleMinutes, newId)
  const session = activeSession(started)!
  const match: Match = { ...input, id: newId(), recordedAt: now.toISOString(), sessionId: session.id }
  return { data: { ...started, matches: [...started.matches, match] }, match }
}

/** Replaces a match's content; id, time and session stay. */
export function updateMatch(data: TrackerData, id: string, input: NewMatch): TrackerData {
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...input, id: m.id, recordedAt: m.recordedAt, sessionId: m.sessionId } : m))
  }
}

/** Removes a match; an ended session left without matches is removed too. */
export function deleteMatch(data: TrackerData, id: string): TrackerData {
  const match = data.matches.find((m) => m.id === id)
  if (!match) return data
  const matches = data.matches.filter((m) => m.id !== id)
  const sessions = data.sessions.filter(
    (s) => s.id !== match.sessionId || s.endedAt === null || matches.some((m) => m.sessionId === s.id)
  )
  return { ...data, matches, sessions }
}

export function lastMatch(data: TrackerData): Match | null {
  return data.matches.length ? data.matches[data.matches.length - 1] : null
}
