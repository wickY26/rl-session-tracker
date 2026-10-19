/**
 * Builds the digit templates from the screenshots in fixtures/ and their expected .json values.
 *   npx tsx scripts/build-templates.mts [--only <file>] [--out <path>]
 * Rows are matched to the .json by position (team, row order).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STAT_KEYS } from '../src/core/types'
import { encodeGlyph, iou, normalizeGlyph, segmentGlyphs, type GlyphTemplates } from '../src/ocr/glyphs'
import { prepareDigits } from '../src/ocr/image'
import { ScoreboardReader } from '../src/ocr/reader'

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'src/ocr/digit-templates.json'
const FIXTURES = 'fixtures'
const MAX_SAMPLES = 8

const reader = new ScoreboardReader({ langPath: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int', accountName: '' })
const templates: Record<string, Uint8Array[]> = {}

const files = readdirSync(FIXTURES).filter(
  (f) => /\.(png|jpe?g)$/i.test(f) && existsSync(join(FIXTURES, f.replace(/\.\w+$/, '.json'))) && (!only || f === only)
)
for (const file of files) {
  const expected = JSON.parse(readFileSync(join(FIXTURES, file.replace(/\.\w+$/, '.json')), 'utf8'))
  const located = await reader.locate(readFileSync(join(FIXTURES, file)))
  if (!located) throw new Error(`${file}: scoreboard not found`)
  located.teams.forEach((team, ti) => {
    const want = expected.teams[ti].players
    if (team.rows.length !== want.length) throw new Error(`${file}: team ${ti} has ${team.rows.length} rows, expected ${want.length}`)
    team.rows.forEach((row, ri) => {
      const exp = want[ri]
      for (const key of STAT_KEYS) {
        const text = String(exp[key])
        const piece = prepareDigits(located.img, row.cells[key])
        const glyphs = piece ? segmentGlyphs(piece) : []
        if (!piece || glyphs.length !== text.length) {
          console.warn(`${file} ${exp.name}.${key}: ${glyphs.length} glyphs, expected "${text}" — skipped`)
          continue
        }
        glyphs.forEach((g, i) => {
          const vec = normalizeGlyph(piece, g)
          const list = (templates[text[i]] ??= [])
          if (list.length < MAX_SAMPLES && !list.some((t) => iou(t, vec) > 0.97)) list.push(vec)
        })
      }
    })
  })
}
await reader.dispose()

const result: GlyphTemplates = {}
for (const d of '0123456789') result[d] = (templates[d] ?? []).map(encodeGlyph)
writeFileSync(out, JSON.stringify(result, null, 0))
console.log(out, Object.entries(result).map(([d, s]) => `${d}:${s.length}`).join(' '))
