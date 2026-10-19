import { describe, expect, it } from 'vitest'
import {
  activeSession,
  addMatch,
  closeIdleSession,
  deleteMatch,
  emptyData,
  endSession,
  sessionMatches,
  startSession,
  updateMatch
} from '../src/core/sessions'
import { at, ids, match } from './helpers'

const IDLE = 120

describe('sessions', () => {
  it('auto-starts a session when a match is saved with none active', () => {
    const { data, match: saved } = addMatch(emptyData(), match({}), at(0), IDLE, ids())
    const session = activeSession(data)!
    expect(session.startedAt).toBe(at(0).toISOString())
    expect(saved.sessionId).toBe(session.id)
  })

  it('keeps adding to the active session while not idle', () => {
    const newId = ids()
    let data = addMatch(emptyData(), match({}), at(0), IDLE, newId).data
    data = addMatch(data, match({}), at(100), IDLE, newId).data
    data = addMatch(data, match({}), at(200), IDLE, newId).data
    expect(data.sessions).toHaveLength(1)
    expect(sessionMatches(data, data.sessions[0].id)).toHaveLength(3)
  })

  it('closes an idle session at its last match time and opens a new one', () => {
    const newId = ids()
    let data = addMatch(emptyData(), match({}), at(0), IDLE, newId).data
    data = addMatch(data, match({}), at(30), IDLE, newId).data
    data = addMatch(data, match({}), at(30 + IDLE + 1), IDLE, newId).data
    const [first, second] = data.sessions
    expect(first.endedAt).toBe(at(30).toISOString())
    expect(first.endReason).toBe('idle')
    expect(second.endedAt).toBeNull()
    expect(sessionMatches(data, second.id)).toHaveLength(1)
  })

  it('idle check does nothing before the limit', () => {
    const data = addMatch(emptyData(), match({}), at(0), IDLE, ids()).data
    expect(closeIdleSession(data, at(IDLE), IDLE)).toBe(data)
    expect(activeSession(closeIdleSession(data, at(IDLE + 1), IDLE))).toBeNull()
  })

  it('a started session with no matches is dropped when it idles out', () => {
    const data = startSession(emptyData(), at(0), IDLE, ids())
    expect(closeIdleSession(data, at(IDLE + 1), IDLE).sessions).toEqual([])
  })

  it('startSession is a no-op while a session is active', () => {
    const data = startSession(emptyData(), at(0), IDLE, ids())
    expect(startSession(data, at(5), IDLE, ids('x'))).toBe(data)
  })

  it('manual end sets endReason; ending an empty session removes it', () => {
    const newId = ids()
    const empty = startSession(emptyData(), at(0), IDLE, newId)
    expect(endSession(empty, at(10)).sessions).toEqual([])

    const data = addMatch(emptyData(), match({}), at(0), IDLE, newId).data
    const ended = endSession(data, at(20)).sessions[0]
    expect(ended.endedAt).toBe(at(20).toISOString())
    expect(ended.endReason).toBe('manual')
  })

  it('updateMatch replaces content but keeps id, time and session', () => {
    const { data, match: saved } = addMatch(emptyData(), match({ mmr: 900 }), at(0), IDLE, ids())
    const next = updateMatch(data, saved.id, match({ mmr: 950 }))
    const updated = next.matches[0]
    expect(updated.teams[0].players[0].mmr).toBe(950)
    expect(updated.id).toBe(saved.id)
    expect(updated.recordedAt).toBe(saved.recordedAt)
    expect(updated.sessionId).toBe(saved.sessionId)
  })

  it('deleting the only match of an ended session removes the session; the active one stays', () => {
    const newId = ids()
    let data = addMatch(emptyData(), match({}), at(0), IDLE, newId).data
    data = endSession(data, at(10))
    const firstMatch = data.matches[0]
    data = addMatch(data, match({}), at(20), IDLE, newId).data
    const activeMatch = data.matches[1]

    data = deleteMatch(data, firstMatch.id)
    expect(data.sessions).toHaveLength(1)
    data = deleteMatch(data, activeMatch.id)
    expect(activeSession(data)).not.toBeNull()
  })
})
