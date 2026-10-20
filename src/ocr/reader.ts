import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { MODES, STAT_KEYS, type Mode, type StatKey } from '../core/types'
import { matchGlyph, normalizeGlyph, segmentGlyphs, type GlyphTemplates } from './glyphs'
import {
  adaptiveBinarize,
  clampBox,
  cropBinarized,
  cropForOcr,
  findBlobs,
  fullBinarized,
  loadNormalized,
  mapBack,
  prepareDigits,
  toPaddedPng,
  type Channel,
  type Image
} from './image'
import { bannerBox, cellBox, findLayout, nameBand, scoreStrip, type Layout } from './layout'
import { findMmr, isCasual, parseNameLine } from './name-line'
import { findAccount, isLabel } from './names'
import { mmrColumnRegion, readMmrColumn } from './mmr-column'
import { hasPartyIcon } from './party-icon'
import type { Box, ReadingPlayer, ReadingTeam, ScoreboardReading, TeamColor, Word } from './types'

export interface ReaderOptions {
  /** Folder holding eng.traineddata(.gz). */
  langPath: string
  /** Account name of the tracked player; used to find "me". */
  accountName: string
  /** Digit templates (built by scripts/build-templates). Tesseract is used when empty. */
  templates?: GlyphTemplates
  /** When set, crops and OCR text are written here (for tuning). */
  debugDir?: string
}

export interface Line {
  text: string
  box: Box
  words: Word[]
}

// Minimal shape of tesseract.js block output
interface TBox { x0: number; y0: number; x1: number; y1: number }
interface TWord { text: string; confidence: number; bbox: TBox }
interface TLine { text: string; bbox: TBox; words: TWord[] }
interface TBlock { paragraphs: { lines: TLine[] }[] }

export interface LocatedRow {
  /** Vertical center of the row's stat digits. */
  center: number
  rawLine: string
  /** x where the name text starts (party icon sits just left of it). */
  nameX: number | null
  /** Region of the `+9 1273` MMR column left of the row (current layout). */
  mmrColumn: Box
  /** Where the `[MMR ± change]` bracket is, with the digit counts OCR saw; null when there is none (older layout). */
  mmr: { box: Box; valueDigits: number; changeDigits: number; sign: 1 | -1 } | null
  cells: Record<StatKey, Box>
  party: boolean
}

export interface LocatedTeam {
  color: TeamColor | null
  rows: LocatedRow[]
  bannerWords: string[]
}

export interface LocatedScoreboard {
  img: Image
  layout: Layout
  teams: [LocatedTeam, LocatedTeam]
}

const LAYOUT_THRESHOLDS = [170, 140, 200, 110]
/** Below this template similarity a digit counts as unreadable. */
const MIN_GLYPH_SCORE = 0.55
/**
 * Row digits must stand out from their surroundings by this much (min channel). Faded rows of players
 * who left are only ~80–115 bright on a ~10–50 background, so a global threshold can't be used.
 */
const ROW_INK_OFFSET = 25
const ROW_INK_FLOOR = 55

/**
 * Row centers of one team from the SCORE column: every player row has a number there.
 * Digit-sized blobs are clustered by height position; at most 3 rows.
 */
export function findRowCenters(img: Image, strip: Box, h: number): number[] {
  const box = clampBox(strip, img)
  if (box.x1 - box.x0 < 4 || box.y1 - box.y0 < 4) return []
  const piece = img.clone() as Image
  piece.crop({ x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 })
  adaptiveBinarize(piece, 'min', Math.round(h * 1.5), ROW_INK_OFFSET, ROW_INK_FLOOR)
  const digits = findBlobs(piece)
    .map((b) => b.box)
    .filter((b) => {
      const bh = b.y1 - b.y0
      // Stat digits are ~1.7× the header letters; header text itself must not count as a row
      return bh >= h * 1.25 && bh <= h * 2.6 && b.x1 - b.x0 < piece.bitmap.width * 0.5
    })
    .sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1))
  const rows: { y0: number; y1: number; count: number }[] = []
  for (const d of digits) {
    const row = rows.find((r) => Math.abs((r.y0 + r.y1) / 2 - (d.y0 + d.y1) / 2) < h)
    if (row) {
      row.y0 = Math.min(row.y0, d.y0)
      row.y1 = Math.max(row.y1, d.y1)
      row.count++
    } else rows.push({ y0: d.y0, y1: d.y1, count: 1 })
  }
  return rows.slice(0, 3).map((r) => box.y0 + (r.y0 + r.y1) / 2)
}

const alnumCount = (text: string) => (text.match(/[A-Za-z0-9]/g) ?? []).length

/**
 * Picks the name line in a row's name band: the line with the most letters/digits whose center is
 * at or above the row center (the player title sits below the name, avatar junk has few letters).
 */
export function pickNameLine(lines: readonly Line[], rowCenter: number, h: number): Line | null {
  let best: Line | null = null
  for (const line of lines) {
    const center = (line.box.y0 + line.box.y1) / 2
    if (center > rowCenter + h * 0.3 || center < rowCenter - h * 2.2) continue
    if (alnumCount(line.text) < 2) continue
    if (!best || alnumCount(line.text) > alnumCount(best.text)) best = line
  }
  return best
}

/** Box of the words that make up the MMR bracket in a name line. */
export function mmrWords(line: Line): LocatedRow['mmr'] {
  let text = ''
  const spans = line.words.map((w) => {
    const start = text.length
    text += w.text + ' '
    return { start, end: start + w.text.length, box: w.box }
  })
  const m = findMmr(text)
  if (!m) return null
  const hit = spans.filter((s) => s.end > m.index && s.start < m.index + m.length)
  if (!hit.length) return null
  return {
    box: {
      x0: Math.min(...hit.map((s) => s.box.x0)),
      y0: Math.min(...hit.map((s) => s.box.y0)),
      x1: Math.max(...hit.map((s) => s.box.x1)),
      y1: Math.max(...hit.map((s) => s.box.y1))
    },
    valueDigits: m.value.length,
    changeDigits: m.change.length,
    sign: m.sign
  }
}

/**
 * Reads the MMR digits from glyph shapes. Tesseract misreads this font's slashed zero (Ø → 8/@/S),
 * so the digits are matched against the same templates as the stat columns (same typeface, smaller).
 * Brackets are taller than digits and the sign is shorter, so the digit-height glyphs are exactly the
 * digits (plus any club-tag letters before them): the last `valueDigits + changeDigits` of them are the value and change.
 */
export function readMmrGlyphs(
  piece: Image,
  valueDigits: number,
  changeDigits: number,
  templates: GlyphTemplates
): { value: number; change: number } | null {
  const glyphs = segmentGlyphs(piece)
  if (!glyphs.length) return null
  const heights = glyphs.map((g) => g.y1 - g.y0)
  const maxH = Math.max(...heights)
  const tall = heights.filter((gh) => gh >= maxH * 0.6).sort((a, b) => a - b)
  const digitH = tall[Math.floor(tall.length / 2)]
  const digits = glyphs.filter((g) => {
    const gh = g.y1 - g.y0
    return gh >= digitH * 0.88 && gh <= digitH * 1.12 && g.x1 - g.x0 >= digitH * 0.15
  })
  const total = valueDigits + changeDigits
  if (digits.length < total) return null
  let text = ''
  for (const g of digits.slice(-total)) {
    const m = matchGlyph(normalizeGlyph(piece, g), templates)
    if (!m || m.score < MIN_GLYPH_SCORE) return null
    text += m.digit
  }
  return { value: Number(text.slice(0, valueDigits)), change: Number(text.slice(valueDigits)) }
}

/**
 * Where the name starts (the party icon sits just left of it): the first bracket (club tag / MMR)
 * if there is one, else the first confident word — the icons themselves come through as junk words.
 */
function nameStart(line: Line): number {
  const word =
    line.words.find((w) => /^[[({]/.test(w.text)) ??
    line.words.find((w) => /[A-Za-z0-9]{2}/.test(w.text) && w.confidence > 60) ??
    line.words.find((w) => /[A-Za-z0-9]/.test(w.text))
  return (word ?? line.words[0] ?? line).box.x0
}

/** Whether a stat column has a digit-sized blob at the row's height. */
function hasDigitAt(img: Image, team: Layout['teams'][number], key: StatKey, center: number): boolean {
  const h = team.headerHeight
  const box = clampBox(cellBox(team, key, center), img)
  if (box.x1 - box.x0 < 4 || box.y1 - box.y0 < 4) return false
  const piece = img.clone() as Image
  piece.crop({ x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 })
  adaptiveBinarize(piece, 'min', Math.round(h * 1.5), ROW_INK_OFFSET, ROW_INK_FLOOR)
  const localCenter = center - box.y0
  return findBlobs(piece).some((b) => {
    const bh = b.box.y1 - b.box.y0
    return bh >= h * 1.25 && bh <= h * 2.6 && Math.abs((b.box.y0 + b.box.y1) / 2 - localCenter) < h * 0.6
  })
}

/** A real player row has digits in the other stat columns too (filters accolade popups, stray text). */
function isPlayerRow(img: Image, team: Layout['teams'][number], center: number): boolean {
  const keys: StatKey[] = ['goals', 'assists', 'saves', 'shots']
  return keys.filter((key) => hasDigitAt(img, team, key, center)).length >= 3
}

export class ScoreboardReader {
  private layoutWorker: Worker | null = null
  private textWorker: Worker | null = null
  private digitWorker: Worker | null = null
  private debugCount = 0

  constructor(private options: ReaderOptions) {
    if (options.debugDir) mkdirSync(options.debugDir, { recursive: true })
  }

  private debug(name: string, png: Buffer, text: string): void {
    if (!this.options.debugDir) return
    const file = join(this.options.debugDir, `${String(this.debugCount++).padStart(3, '0')}-${name}`)
    writeFileSync(`${file}.png`, png)
    writeFileSync(`${file}.txt`, text)
  }

  private async ensureWorkers(): Promise<void> {
    if (this.layoutWorker) return
    const make = () => createWorker('eng', 1, { langPath: this.options.langPath, cacheMethod: 'none', gzip: true })
    const [layout, text, digit] = await Promise.all([make(), make(), make()])
    await layout.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    await text.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    await digit.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789' })
    this.layoutWorker = layout
    this.textWorker = text
    this.digitWorker = digit
  }

  /** The tracked account changed in settings. */
  setAccountName(name: string): void {
    this.options.accountName = name
  }

  /** Starts the OCR workers ahead of the first read. */
  async warmUp(): Promise<void> {
    await this.ensureWorkers()
  }

  async dispose(): Promise<void> {
    await Promise.all([this.layoutWorker, this.textWorker, this.digitWorker].map((w) => w?.terminate()))
    this.layoutWorker = this.textWorker = this.digitWorker = null
  }

  private async lines(worker: Worker, png: Buffer): Promise<Line[]> {
    const { data } = await worker.recognize(png, {}, { blocks: true })
    const blocks = (data.blocks ?? []) as unknown as TBlock[]
    const out: Line[] = []
    for (const block of blocks)
      for (const p of block.paragraphs)
        for (const l of p.lines)
          out.push({
            text: l.text.trim(),
            box: l.bbox,
            words: l.words.map((w) => ({ text: w.text, confidence: w.confidence, box: w.bbox }))
          })
    return out
  }

  private async findLayout(img: Image): Promise<Layout | null> {
    for (const threshold of LAYOUT_THRESHOLDS) {
      const lines = await this.lines(this.layoutWorker!, await fullBinarized(img, threshold))
      const layout = findLayout(lines.flatMap((l) => l.words), img.bitmap.width, img.bitmap.height)
      if (layout) return layout
    }
    return null
  }

  private async readText(
    img: Image,
    box: Box,
    channel: Channel,
    targetHeight?: number,
    adaptive?: { radius: number; offset: number; floor: number }
  ): Promise<Line[]> {
    const crop = await cropForOcr(img, box, { channel, targetHeight, scale: targetHeight ? undefined : 2, adaptive })
    if (!crop) return []
    const lines = await this.lines(this.textWorker!, crop.png)
    this.debug('text', crop.png, lines.map((l) => l.text).join('\n'))
    return lines.map((l) => ({
      ...l,
      box: mapBack(crop, l.box),
      words: l.words.map((w) => ({ ...w, box: mapBack(crop, w.box) }))
    }))
  }

  private async locateRow(img: Image, layout: Layout, index: 0 | 1, center: number): Promise<LocatedRow> {
    const team = layout.teams[index]
    const h = team.headerHeight
    // Local contrast: faded names and names over the ball/arena still separate from their background
    const lines = await this.readText(img, nameBand(layout, index, center), 'min', undefined, {
      radius: Math.round(h * 3),
      offset: ROW_INK_OFFSET,
      floor: ROW_INK_FLOOR
    })
    const line = pickNameLine(lines, center, h)
    const nameX = line ? nameStart(line) : null
    return {
      center,
      rawLine: line?.text ?? '',
      nameX,
      mmrColumn: mmrColumnRegion(layout, index, center),
      mmr: line ? mmrWords(line) : null,
      cells: Object.fromEntries(STAT_KEYS.map((key) => [key, cellBox(team, key, center)])) as Record<StatKey, Box>,
      party: nameX !== null && hasPartyIcon(img, nameX, center, h)
    }
  }

  /** Finds the layout, player rows, names, party icons and cell positions (does not read the digits). */
  async locate(input: Buffer | string): Promise<LocatedScoreboard | null> {
    await this.ensureWorkers()
    const img = await loadNormalized(input)
    const layout = await this.findLayout(img)
    if (!layout) return null
    const teams = await Promise.all(
      ([0, 1] as const).map(async (index): Promise<LocatedTeam> => {
        const block = layout.teams[index]
        const centers = findRowCenters(img, scoreStrip(layout, index), block.headerHeight).filter((c) =>
          isPlayerRow(img, block, c)
        )
        const rows: LocatedRow[] = []
        for (const center of centers) rows.push(await this.locateRow(img, layout, index, center))
        // WINNER is bright and in the team color; the max channel separates it
        const bannerLines = await this.readText(img, bannerBox(block), 'max', 80)
        return { color: block.color, rows, bannerWords: bannerLines.flatMap((l) => l.words.map((w) => w.text)) }
      })
    )
    return { img, layout, teams: [teams[0], teams[1]] }
  }

  /** Re-reads the MMR bracket with digit templates; null when it can't be read confidently. */
  readMmr(img: Image, row: LocatedRow): { mmr: number; mmrDelta: number } | null {
    const templates = this.options.templates
    if (!row.mmr || !templates || !Object.keys(templates).length) return null
    const { box, valueDigits, changeDigits, sign } = row.mmr
    const padY = (box.y1 - box.y0) * 0.15
    const region = { x0: box.x0 - padY, y0: box.y0 - padY, x1: box.x1 + padY, y1: box.y1 + padY }
    // Global threshold first; local contrast for faded rows or text over the ball
    for (const adaptive of [false, true]) {
      const piece = cropBinarized(img, region, 150, adaptive)
      const got = piece && readMmrGlyphs(piece, valueDigits, changeDigits, templates)
      if (got) return { mmr: got.value, mmrDelta: sign * got.change }
    }
    return null
  }

  /**
   * Reads a stat cell both with a global threshold and with local contrast. They usually agree; when
   * they don't, the more confident one wins. A faded digit can vanish under the global threshold while
   * bright background text (a "ROCKET LEAGUE" watermark) remains and passes as a digit.
   */
  async readNumber(img: Image, box: Box): Promise<number | null> {
    const templates = this.options.templates
    if (!templates || !Object.keys(templates).length) return this.readNumberTesseract(img, box)
    const [global, local] = [false, true].map((adaptive) => readCell(img, box, adaptive, templates))
    const best = !global ? local : !local ? global : local.score > global.score ? local : global
    if (best && this.options.debugDir) this.debug('num', await toPaddedPng(best.piece), String(best.value))
    return best?.value ?? null
  }

  private async readNumberTesseract(img: Image, box: Box): Promise<number | null> {
    const piece = prepareDigits(img, box, false) ?? prepareDigits(img, box, true)
    if (!piece) return null
    const png = await toPaddedPng(piece)
    const text = (await this.digitWorker!.recognize(png)).data.text
    this.debug('num', png, text)
    return parseNumber(text)
  }

  async read(input: Buffer | string): Promise<ScoreboardReading> {
    const located = await this.locate(input)
    if (!located) return failedReading('Scoreboard not found')
    const { img } = located
    const teams = await Promise.all(
      located.teams.map(async (team): Promise<ReadingTeam> => {
        const players = await Promise.all(
          team.rows.map(async (row): Promise<ReadingPlayer> => {
            const values = await Promise.all(STAT_KEYS.map((key) => this.readNumber(img, row.cells[key])))
            const stats = Object.fromEntries(STAT_KEYS.map((key, i) => [key, values[i]])) as Record<StatKey, number | null>
            const parsed = parseNameLine(row.rawLine)
            // Current layout: MMR column left of the row. Older layout: `[MMR ± change]` in the name.
            const templates = this.options.templates
            const column = templates && Object.keys(templates).length ? readMmrColumn(img, row.mmrColumn, templates) : null
            const glyphMmr = column ? null : this.readMmr(img, row)
            return {
              rawLine: row.rawLine,
              name: parsed.name,
              mmr: column?.mmr ?? glyphMmr?.mmr ?? parsed.mmr,
              mmrDelta: column ? column.mmrDelta : (glyphMmr?.mmrDelta ?? parsed.mmrDelta),
              party: row.party,
              stats
            }
          })
        )
        return { color: team.color, goals: null, players }
      })
    )
    const bannerWinner = located.teams.findIndex((t) => t.bannerWords.some((w) => isLabel(w, 'WINNER')))
    return finalizeReading([teams[0], teams[1]], bannerWinner === -1 ? null : (bannerWinner as 0 | 1), this.options.accountName)
  }
}

/** One stat cell read with digit templates; `score` is the weakest digit's similarity. */
function readCell(img: Image, box: Box, adaptive: boolean, templates: GlyphTemplates): { value: number; score: number; piece: Image } | null {
  const piece = prepareDigits(img, box, adaptive)
  if (!piece) return null
  const glyphs = segmentGlyphs(piece)
  if (!glyphs.length || glyphs.length > 5) return null
  let text = ''
  let score = 1
  for (const g of glyphs) {
    const m = matchGlyph(normalizeGlyph(piece, g), templates)
    if (!m || m.score < MIN_GLYPH_SCORE) return null
    text += m.digit
    score = Math.min(score, m.score)
  }
  return { value: Number(text), score, piece }
}

export function parseNumber(text: string): number | null {
  const digits = text.replace(/\D/g, '')
  if (!digits.length || digits.length > 5) return null
  return Number(digits)
}

function failedReading(fatal: string): ScoreboardReading {
  const empty = (): ReadingTeam => ({ color: null, goals: null, players: [] })
  return { teams: [empty(), empty()], mode: null, winner: null, casual: false, me: null, fatal, warnings: [] }
}

function sumGoals(team: ReadingTeam): number | null {
  let sum = 0
  for (const p of team.players) {
    if (p.stats.goals === null) return null
    sum += p.stats.goals
  }
  return sum
}

/**
 * Completes a raw reading and collects warnings. Pure.
 * Team score = sum of player goals; winner comes from the WINNER banner, else from the goal sums.
 */
export function finalizeReading(
  teams: [ReadingTeam, ReadingTeam],
  bannerWinner: 0 | 1 | null,
  accountName: string
): ScoreboardReading {
  const warnings: string[] = []
  for (const team of teams) team.goals = sumGoals(team)

  const [a, b] = teams.map((t) => t.goals)
  const goalWinner: 0 | 1 | null = a !== null && b !== null && a !== b ? (a > b ? 0 : 1) : null
  const winner = bannerWinner ?? goalWinner
  if (bannerWinner !== null && goalWinner !== null && bannerWinner !== goalWinner) {
    warnings.push('WINNER banner and goal totals disagree (own goal?) — check the scores')
  }
  if (winner === null) warnings.push('Could not tell which team won')

  const [sizeA, sizeB] = teams.map((t) => t.players.length)
  const mode: Mode | null = sizeA === sizeB && sizeA >= 1 && sizeA <= 3 ? MODES[sizeA - 1] : null
  if (!mode) warnings.push(`Teams have different player counts (${sizeA} vs ${sizeB})`)

  const all = teams.flatMap((t, ti) => t.players.map((p, index) => ({ p, team: ti as 0 | 1, index })))
  const casual = all.length > 0 && isCasual(all.map((x) => x.p))
  const found = findAccount(all.map((x) => x.p.name), accountName)
  const me = found === -1 ? null : { team: all[found].team, index: all[found].index }
  if (!me) warnings.push(`Account "${accountName}" not found on the scoreboard`)
  // My own name is known exactly; don't show OCR slips (wickY2G) for it
  else teams[me.team].players[me.index].name = accountName

  for (const { p } of all) {
    const who = p.name || '?'
    if (!p.name) warnings.push(`Unreadable player name: "${p.rawLine}"`)
    if (!casual && p.mmr === null) warnings.push(`${who}: MMR not readable`)
    for (const key of STAT_KEYS) if (p.stats[key] === null) warnings.push(`${who}: ${key} not readable`)
  }
  return { teams, mode, winner, casual, me, fatal: null, warnings }
}
