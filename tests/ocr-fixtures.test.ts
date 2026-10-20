import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { foldName, similarity } from '../src/core/text'
import { STAT_KEYS } from '../src/core/types'
import templates from '../src/ocr/digit-templates.json'
import { nameKey } from '../src/ocr/names'
import { ScoreboardReader } from '../src/ocr/reader'
import type { ReadingPlayer } from '../src/ocr/types'

const ROOT = join(__dirname, '..')
const FIXTURES = join(ROOT, 'fixtures')
const reader = new ScoreboardReader({
  langPath: join(ROOT, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
  accountName: '',
  templates
})

afterAll(() => reader.dispose())

/**
 * Each screenshot has a same-named .json with the expected reading:
 * { accountName, mode, winner, casual, me, teams: [{ players: [{ name, mmr, mmrDelta, party, score, goals, assists, saves, shots }] }] }
 * MMR, party flags and stats must match exactly. Names may differ by an OCR letter (similarity ≥ 0.8 after folding 0/O, 1/l, 5/S…) —
 * the confirm card shows them for correction and teammate snapping absorbs repeats.
 * Optional `"unreadable": ["1.1.mmrDelta"]` (team.row.field) lists values the reader is known to miss:
 * there it may return null — never a wrong number. An empty field is flagged on the card; a wrong one isn't.
 */
const cases = readdirSync(FIXTURES).filter(
  (f) => /\.(png|jpe?g)$/i.test(f) && existsSync(join(FIXTURES, f.replace(/\.\w+$/, '.json')))
)

describe('scoreboard OCR fixtures', () => {
  it.each(cases)('%s', async (file) => {
    const expected = JSON.parse(readFileSync(join(FIXTURES, file.replace(/\.\w+$/, '.json')), 'utf8'))
    reader.setAccountName(expected.accountName)
    const reading = await reader.read(readFileSync(join(FIXTURES, file)))
    expect(reading.fatal).toBeNull()
    // Documented misses may leave an "MMR not readable" warning for that player; nothing else
    const missedNames = (expected.unreadable ?? [])
      .filter((u: string) => u.endsWith('.mmr'))
      .map((u: string) => reading.teams[Number(u.split('.')[0])]?.players[Number(u.split('.')[1])]?.name || '?')
    expect(reading.warnings.filter((w) => !missedNames.some((n: string) => w === `${n}: MMR not readable`))).toEqual([])
    expect({ mode: reading.mode, winner: reading.winner, casual: reading.casual, me: reading.me }).toEqual({
      mode: expected.mode,
      winner: expected.winner,
      casual: expected.casual,
      me: expected.me
    })
    type Flat = Record<string, unknown>
    const fromReading = (p: ReadingPlayer): Flat => ({ mmr: p.mmr, mmrDelta: p.mmrDelta, party: p.party, ...p.stats })
    const fromExpected = (p: Flat): Flat => ({
      mmr: p.mmr,
      mmrDelta: p.mmrDelta,
      party: p.party,
      ...Object.fromEntries(STAT_KEYS.map((k) => [k, p[k]]))
    })
    const unreadable = new Set<string>(expected.unreadable ?? [])
    reading.teams.forEach((t, ti) =>
      t.players.forEach((p, pi) => {
        if (unreadable.has(`${ti}.${pi}.mmrDelta`) && p.mmrDelta === null) p.mmrDelta = expected.teams[ti].players[pi].mmrDelta
        if (unreadable.has(`${ti}.${pi}.mmr`) && p.mmr === null) p.mmr = expected.teams[ti].players[pi].mmr
      })
    )
    expect(reading.teams.map((t) => t.players.map(fromReading))).toEqual(
      expected.teams.map((t: { players: Flat[] }) => t.players.map(fromExpected))
    )
    reading.teams.forEach((team, ti) =>
      team.players.forEach((p, pi) => {
        const want = expected.teams[ti].players[pi].name
        expect(similarity(nameKey(foldName(p.name)), nameKey(foldName(want))), `${p.name} ≈ ${want}`).toBeGreaterThanOrEqual(0.8)
      })
    )
  })
})
