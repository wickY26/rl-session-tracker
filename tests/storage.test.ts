import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMatch, emptyData } from '../src/core/sessions'
import { DEFAULT_SETTINGS } from '../src/core/types'
import { Storage } from '../src/main/storage'
import { at, ids, match } from './helpers'

let dir: string
let storage: Storage

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rlst-'))
  storage = new Storage(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('storage', () => {
  it('starts empty and round-trips data', () => {
    expect(storage.loadData()).toEqual({ data: emptyData(), recoveredFromBackup: false })
    const data = addMatch(emptyData(), match({}), at(0), 120, ids()).data
    storage.saveData(data)
    expect(storage.loadData().data).toEqual(data)
  })

  it('keeps the previous version as .bak on every write', () => {
    const first = addMatch(emptyData(), match({}), at(0), 120, ids()).data
    storage.saveData(first)
    storage.saveData(emptyData())
    expect(JSON.parse(readFileSync(join(dir, 'tracker.json.bak'), 'utf8'))).toEqual(first)
  })

  it('falls back to .bak when tracker.json is corrupt', () => {
    const data = addMatch(emptyData(), match({}), at(0), 120, ids()).data
    storage.saveData(data)
    storage.saveData(data)
    writeFileSync(join(dir, 'tracker.json'), '{ broken')
    expect(storage.loadData()).toEqual({ data, recoveredFromBackup: true })
  })

  it('throws instead of starting empty when nothing is readable', () => {
    writeFileSync(join(dir, 'tracker.json'), '{ broken')
    expect(() => storage.loadData()).toThrow(/unreadable/)
  })

  it('refuses data from an unknown schema version', () => {
    writeFileSync(join(dir, 'tracker.json'), JSON.stringify({ ...emptyData(), schemaVersion: 2 }))
    expect(() => storage.loadData()).toThrow(/schema version 2/)
  })

  it('merges saved settings over defaults', () => {
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS)
    storage.saveSettings({ ...DEFAULT_SETTINGS, accountName: 'wickY26', hotkeys: { ...DEFAULT_SETTINGS.hotkeys, capture: 'F6' } })
    const loaded = storage.loadSettings()
    expect(loaded.accountName).toBe('wickY26')
    expect(loaded.hotkeys.capture).toBe('F6')
    expect(loaded.hotkeys.session).toBe('F9')
  })
})
