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

/** Mean colour of the bright pixels inside a box of the original image. */
function inkColor(img: Image, box: Box): { r: number; g: number; b: number } | null {
  const { width, data } = img.bitmap
  const px: [number, number, number][] = []
  for (let y = Math.floor(box.y0); y < Math.ceil(box.y1); y++)
    for (let x = Math.floor(box.x0); x < Math.ceil(box.x1); x++) {
      const i = (y * width + x) * 4
      px.push([data[i], data[i + 1], data[i + 2]])
    }
  if (!px.length) return null
  // The brightest quarter is the glyph itself, not the background between strokes
  px.sort((a, b) => Math.max(...b) - Math.max(...a))
  const top = px.slice(0, Math.max(1, Math.floor(px.length / 4)))
  const mean = (k: 0 | 1 | 2) => top.reduce((s, p) => s + p[k], 0) / top.length
  return { r: mean(0), g: mean(1), b: mean(2) }
}

/** Gold/yellow (+) keeps a lot of green next to red; red (−) doesn't. */
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
 * (same font); the sign comes from the change's colour. Null when the column isn't there
 * (older layout with `[MMR ± change]` in the name, or a casual match).
 */
export function readMmrColumn(img: Image, region: Box, templates: GlyphTemplates): { mmr: number; mmrDelta: number | null } | null {
  const cropped = cropScaled(img, region, (h) => PIECE_HEIGHT / h)
  if (!cropped) return null
  const { piece, box, scale } = cropped
  // Max channel: the white MMR and the coloured change both stand out
  adaptiveBinarize(piece, 'max', Math.round(PIECE_HEIGHT / 2), 25, 70)
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const heightOf = (g: GlyphBox) => g.y1 - g.y0
  // Digits are taller than wide; '+', the rank-bar squares and the emblem are not
  const digitShaped = (g: GlyphBox, min: number, max: number) =>
    heightOf(g) >= min && heightOf(g) <= max && (g.x1 - g.x0) / heightOf(g) < 0.92 && (g.x1 - g.x0) / heightOf(g) >= 0.15

  const read = (group: GlyphBox[]): string | null => {
    let out = ''
    for (const g of group) {
      // A thin stroke is a '1' — the change uses a lighter '1' than the templates have
      if ((g.x1 - g.x0) / heightOf(g) < 0.45) {
        out += '1'
        continue
      }
      const m = matchGlyph(normalizeGlyph(piece, g), templates)
      if (!m || m.score < MIN_GLYPH_SCORE) return null
      out += m.digit
    }
    return out
  }

  // MMR: the tallest group of 3–4 digit-shaped glyphs
  const sized = segmentGlyphs(piece).filter((g) => digitShaped(g, PIECE_HEIGHT * 0.35, PIECE_HEIGHT * 0.95))
  if (sized.length < 3) return null
  const groups = groupByGap(sized, median(sized.map(heightOf)) * 0.4)
  const groupHeight = (group: GlyphBox[]) => median(group.map(heightOf))
  let mmrGroup: GlyphBox[] | null = null
  for (const group of groups) {
    if (group.length >= 3 && group.length <= 4 && (!mmrGroup || groupHeight(group) > groupHeight(mmrGroup))) mmrGroup = group
  }
  if (!mmrGroup) return null
  const mmrText = read(mmrGroup)
  if (mmrText === null) return null

  // Change: smaller digits bottom-aligned with the MMR, left of it. Blank everything outside that
  // line first so arena streaks above don't fuse with them, then take the closest group.
  const mmrH = groupHeight(mmrGroup)
  const bottom = Math.max(...mmrGroup.map((g) => g.y1))
  const mmrX0 = mmrGroup[0].x0
  const { width, data } = piece.bitmap
  for (let y = 0; y < piece.bitmap.height; y++) {
    if (y >= bottom - mmrH * 0.92 && y <= bottom + mmrH * 0.08) continue
    for (let x = 0; x < mmrX0; x++) {
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
    }
  }
  const left = segmentGlyphs(piece).filter((g) => g.x1 <= mmrX0 && digitShaped(g, mmrH * 0.55, mmrH * 1.0))
  const leftGroups = groupByGap(left, mmrH * 0.4)
  const nearest = leftGroups[leftGroups.length - 1]
  const changeGroup = nearest && nearest.length <= 3 && mmrX0 - nearest[nearest.length - 1].x1 < mmrH * 1.5 ? nearest : null
  const changeText = changeGroup ? read(changeGroup) : null
  let mmrDelta: number | null = null
  if (changeGroup && changeText !== null) {
    const toOriginal = (g: GlyphBox): Box => ({
      x0: box.x0 + g.x0 / scale,
      y0: box.y0 + g.y0 / scale,
      x1: box.x0 + g.x1 / scale,
      y1: box.y0 + g.y1 / scale
    })
    const first = toOriginal(changeGroup[0])
    const last = toOriginal(changeGroup[changeGroup.length - 1])
    const color = inkColor(img, { x0: first.x0, y0: first.y0, x1: last.x1, y1: last.y1 })
    mmrDelta = color ? signFromColor(color) * Number(changeText) : null
  }
  return { mmr: Number(mmrText), mmrDelta }
}
