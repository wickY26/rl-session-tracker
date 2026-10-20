import { matchGlyph, normalizeGlyph, segmentGlyphs, type GlyphBox, type GlyphTemplates } from './glyphs'
import { adaptiveBinarize, cropScaled, type Image } from './image'
import { labelBox, type Layout } from './layout'
import type { Box } from './types'

/** Below this template similarity a digit counts as unreadable. */
const MIN_GLYPH_SCORE = 0.55
const PIECE_HEIGHT = 150

/**
 * Current competitive layout: left of each row, before the rank emblem, `+9 1273` —
 * the change (gold when up, red when down) and the MMR after the match (white).
 */
export function mmrColumnRegion(layout: Layout, index: 0 | 1, rowCenter: number): Box {
  const team = layout.teams[index]
  const h = team.headerHeight
  const x1 = labelBox(team).x0
  // Tight vertically: the digits are ~1.7×h tall; arena streaks above/below would merge into them
  return { x0: x1 - h * 22, y0: rowCenter - h * 1.15, x1, y1: rowCenter + h * 1.15 }
}

/** Clearly red change digits (MMR went down) — also when faded. An orange particle trail is not red. */
export function isChangeRed(r: number, g: number, b: number): boolean {
  return r > 90 && r > g * 2 && r > b * 2
}

/** Sign from the change digits' mean colour: red keeps little green, gold (also faded towards grey) keeps a lot. */
export function signFromColor(c: { r: number; g: number; b: number }): 1 | -1 {
  return c.g > c.r * 0.6 ? 1 : -1
}

/** Splits digit glyphs into groups separated by a gap wider than `gap`. */
function groupByGap(glyphs: GlyphBox[], gap: number): GlyphBox[][] {
  const groups: GlyphBox[][] = []
  for (const g of glyphs) {
    const last = groups[groups.length - 1]
    if (last && g.x0 - last[last.length - 1].x1 <= gap) last.push(g)
    else groups.push([g])
  }
  return groups
}

/**
 * Reads `+9 1273` from the MMR column. Digits are matched against the stat-column templates
 * (same font). Null when the column isn't there (older layout with `[MMR ± change]` in the name,
 * or a casual match).
 */
export function readMmrColumn(img: Image, region: Box, templates: GlyphTemplates): { mmr: number; mmrDelta: number | null } | null {
  const cropped = cropScaled(img, region, (h) => PIECE_HEIGHT / h)
  if (!cropped) return null
  const colour = cropped.piece.clone() as Image
  const piece = cropped.piece
  // Max channel: the white MMR digits stand out from the arena behind them
  adaptiveBinarize(piece, 'max', Math.round(PIECE_HEIGHT / 2), 25, 70)

  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const heightOf = (g: GlyphBox) => g.y1 - g.y0
  // Digits are taller than wide; '+', the rank-bar squares and the emblem are not
  const digitShaped = (g: GlyphBox, min: number, max: number) => {
    const aspect = (g.x1 - g.x0) / heightOf(g)
    return heightOf(g) >= min && heightOf(g) <= max && aspect < 0.92 && aspect >= 0.15
  }
  /** The digit a glyph shows, or null for anything that isn't confidently a digit. */
  const digitOf = (bin: Image, g: GlyphBox): string | null => {
    // A thin stroke is a '1' — the change uses a lighter '1' than the templates have
    if ((g.x1 - g.x0) / heightOf(g) < 0.45) return '1'
    const m = matchGlyph(normalizeGlyph(bin, g), templates)
    return m && m.score >= MIN_GLYPH_SCORE ? String(m.digit) : null
  }

  // MMR: the tallest group of 3–4 recognised digits. Unrecognised blobs (faded change digits fused
  // with the background, icons) are dropped before grouping so they can't glue onto the MMR.
  const recognised = segmentGlyphs(piece)
    .filter((g) => digitShaped(g, PIECE_HEIGHT * 0.35, PIECE_HEIGHT * 0.95))
    .map((g) => ({ g, d: digitOf(piece, g) }))
    .filter((x): x is { g: GlyphBox; d: string } => x.d !== null)
  // The small square of the rank-bars icon can pass as a '0'; it is far shorter than real digits
  const typical = median(recognised.map((x) => heightOf(x.g)))
  const digits = recognised.filter((x) => heightOf(x.g) >= typical * 0.6)
  if (digits.length < 3) return null
  const groups = groupByGap(
    digits.map((x) => x.g),
    median(digits.map((x) => heightOf(x.g))) * 0.4
  )
  const groupHeight = (group: GlyphBox[]) => median(group.map(heightOf))
  let mmrGroup: GlyphBox[] | null = null
  for (const group of groups) {
    if (group.length >= 3 && group.length <= 4 && (!mmrGroup || groupHeight(group) > groupHeight(mmrGroup))) mmrGroup = group
  }
  if (!mmrGroup) return null
  const mmrText = mmrGroup.map((g) => digits.find((x) => x.g === g)!.d).join('')

  return { mmr: Number(mmrText), mmrDelta: readChange(piece, colour, mmrGroup, groupHeight(mmrGroup), digitShaped, digitOf) }
}

/**
 * The change left of the MMR. Only the MMR digits' line is used (bottom-aligned, ~80 % of their
 * height), so arena streaks above can't fuse with the digits.
 * 1. Brightness (the binarized piece), with the sign from the digits' colour.
 * 2. When that fails, a red mask: red digits separate cleanly from an orange particle trail
 *    that fuses with them by brightness → negative. Not first: it breaks faded digits into slivers.
 */
function readChange(
  bright: Image,
  colour: Image,
  mmrGroup: GlyphBox[],
  mmrH: number,
  digitShaped: (g: GlyphBox, min: number, max: number) => boolean,
  digitOf: (bin: Image, g: GlyphBox) => string | null
): number | null {
  const bottom = Math.max(...mmrGroup.map((g) => g.y1))
  const mmrX0 = mmrGroup[0].x0
  const { width, height, data } = colour.bitmap
  const inLine = (x: number, y: number) => x < mmrX0 && y >= bottom - mmrH * 0.92 && y <= bottom + mmrH * 0.08

  /** Digits of the group closest to the MMR in a binary image, or null. */
  const readFrom = (bin: Image): { text: string; group: GlyphBox[] } | null => {
    // Change digits are 79–87 % of the MMR digits' height; the '+' (67–72 %) and slivers are shorter
    const glyphs = segmentGlyphs(bin)
      .map((g) => trimAttachedMinus(bin, g))
      .filter((g) => digitShaped(g, mmrH * 0.76, mmrH * 1.0))
    const near = groupByGap(glyphs, mmrH * 0.4).pop()
    if (!near || near.length > 3 || mmrX0 - near[near.length - 1].x1 > mmrH * 1.5) return null
    const text = near.map((g) => digitOf(bin, g))
    if (text.some((d) => d === null)) return null
    // A competitive match never changes MMR by 0: a lone '0' means the digit before it was lost
    // (a faded '1' of '-10'), and a wrong number is worse than an empty field
    return Number(text.join('')) === 0 ? null : { text: text.join(''), group: near }
  }

  const red = colour.clone() as Image
  const lineOnly = bright.clone() as Image
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const ink = inLine(x, y) && isChangeRed(data[i], data[i + 1], data[i + 2])
      red.bitmap.data[i] = red.bitmap.data[i + 1] = red.bitmap.data[i + 2] = ink ? 0 : 255
      red.bitmap.data[i + 3] = 255
      if (!inLine(x, y)) lineOnly.bitmap.data[i] = lineOnly.bitmap.data[i + 1] = lineOnly.bitmap.data[i + 2] = 255
    }

  const fromBright = readFrom(lineOnly)
  if (fromBright) {
    const color = inkColor(colour, fromBright.group)
    return color ? signFromColor(color) * Number(fromBright.text) : null
  }
  const fromRed = readFrom(red)
  return fromRed ? -Number(fromRed.text) : null
}

/**
 * A '-' joined to the first digit (through specks of a particle trail) makes one glyph too wide to be
 * a digit. Drop its leading columns while their ink sits only in the middle band — a minus bar.
 * Real digits are left alone: '7' has its ink at the top, '4' lower down, and normal widths skip this.
 */
function trimAttachedMinus(bin: Image, g: GlyphBox): GlyphBox {
  const h = g.y1 - g.y0
  if ((g.x1 - g.x0) / h <= 0.85) return g
  const { width, data } = bin.bitmap
  const lo = g.y0 + h * 0.3
  const hi = g.y0 + h * 0.7
  let x0 = g.x0
  for (; x0 < g.x1; x0++) {
    let minusOnly = true
    for (let y = g.y0; y < g.y1 && minusOnly; y++) if (data[(y * width + x0) * 4] === 0 && (y < lo || y > hi)) minusOnly = false
    if (!minusOnly) break
  }
  return x0 === g.x0 || x0 >= g.x1 ? g : { ...g, x0 }
}

/** Mean colour of the brightest quarter of the pixels inside the glyphs (the strokes, not the gaps). */
function inkColor(colour: Image, glyphs: GlyphBox[]): { r: number; g: number; b: number } | null {
  const { width, data } = colour.bitmap
  const px: [number, number, number][] = []
  for (const g of glyphs)
    for (let y = g.y0; y < g.y1; y++)
      for (let x = g.x0; x < g.x1; x++) {
        const i = (y * width + x) * 4
        px.push([data[i], data[i + 1], data[i + 2]])
      }
  if (!px.length) return null
  px.sort((a, b) => Math.max(...b) - Math.max(...a))
  const top = px.slice(0, Math.max(1, Math.floor(px.length / 4)))
  const mean = (k: 0 | 1 | 2) => top.reduce((s, p) => s + p[k], 0) / top.length
  return { r: mean(0), g: mean(1), b: mean(2) }
}
