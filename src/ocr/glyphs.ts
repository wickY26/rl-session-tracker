import type { Image } from './image'

/**
 * Template matching for Rocket League scoreboard digits.
 * Tesseract reads 5 as 8/9 and the slashed zero (Ø) as 7 in this font;
 * since the font is fixed, comparing against templates extracted from real screenshots is far more reliable.
 */

export const GLYPH_W = 20
export const GLYPH_H = 28

export interface GlyphBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Connected components of black (0) ink pixels; sorted by x. */
export function segmentGlyphs(img: Image): GlyphBox[] {
  const { width, height, data } = img.bitmap
  const visited = new Uint8Array(width * height)
  const boxes: GlyphBox[] = []
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || data[start * 4] !== 0) continue
    const box = { x0: width, y0: height, x1: 0, y1: 0 }
    const stack = [start]
    visited[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % width
      const y = (p - x) / width
      box.x0 = Math.min(box.x0, x)
      box.x1 = Math.max(box.x1, x + 1)
      box.y0 = Math.min(box.y0, y)
      box.y1 = Math.max(box.y1, y + 1)
      // 8-connectivity: keeps thin diagonal strokes (Ø) from breaking apart
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const n = ny * width + nx
          if (visited[n] || data[n * 4] !== 0) continue
          visited[n] = 1
          stack.push(n)
        }
    }
    boxes.push(box)
  }
  boxes.sort((a, b) => a.x0 - b.x0)
  // Pieces that overlap heavily horizontally are the same digit (broken stroke)
  const merged: GlyphBox[] = []
  for (const b of boxes) {
    const last = merged[merged.length - 1]
    const overlap = last ? Math.min(last.x1, b.x1) - Math.max(last.x0, b.x0) : 0
    if (last && overlap > (b.x1 - b.x0) * 0.6) {
      last.x0 = Math.min(last.x0, b.x0)
      last.x1 = Math.max(last.x1, b.x1)
      last.y0 = Math.min(last.y0, b.y0)
      last.y1 = Math.max(last.y1, b.y1)
    } else merged.push({ ...b })
  }
  return merged.flatMap((b) => splitWide(img, b))
}

/** A single digit's width/height ratio is ~0.55–0.82; noticeably above that means adjacent digits. */
const DIGIT_ASPECT = 0.75

/**
 * Digits whose strokes line up at the same height (44, 77) touch and merge into one component.
 * Splits the box into the expected number of digits, placing each cut at the least-inked
 * column around the expected boundary, then tightens each part to its own ink.
 */
function splitWide(img: Image, box: GlyphBox): GlyphBox[] {
  const bw = box.x1 - box.x0
  const n = Math.round(bw / ((box.y1 - box.y0) * DIGIT_ASPECT))
  if (n < 2) return [box]
  const { width, data } = img.bitmap
  const ink = (x: number) => {
    let c = 0
    for (let y = box.y0; y < box.y1; y++) if (data[(y * width + x) * 4] === 0) c++
    return c
  }
  const cuts = [box.x0]
  const step = bw / n
  for (let i = 1; i < n; i++) {
    const center = Math.round(box.x0 + step * i)
    const reach = Math.round(step * 0.2)
    let best = center
    for (let x = center - reach; x <= center + reach; x++) if (ink(x) < ink(best)) best = x
    cuts.push(best)
  }
  cuts.push(box.x1)
  const parts: GlyphBox[] = []
  for (let i = 0; i < n; i++) {
    const part = { x0: cuts[i + 1], y0: box.y1, x1: cuts[i], y1: box.y0 }
    for (let y = box.y0; y < box.y1; y++)
      for (let x = cuts[i]; x < cuts[i + 1]; x++) {
        if (data[(y * width + x) * 4] !== 0) continue
        part.x0 = Math.min(part.x0, x)
        part.x1 = Math.max(part.x1, x + 1)
        part.y0 = Math.min(part.y0, y)
        part.y1 = Math.max(part.y1, y + 1)
      }
    if (part.x1 > part.x0) parts.push(part)
  }
  return parts
}

/**
 * Scales the digit to a fixed height (aspect ratio preserved so '1' stays narrow)
 * and centers it in a GLYPH_W x GLYPH_H grid. 1 = ink.
 */
export function normalizeGlyph(img: Image, box: GlyphBox): Uint8Array {
  const { width, data } = img.bitmap
  const out = new Uint8Array(GLYPH_W * GLYPH_H)
  const bw = box.x1 - box.x0
  const bh = box.y1 - box.y0
  const scale = GLYPH_H / bh
  const w = Math.min(GLYPH_W, Math.max(1, Math.round(bw * scale)))
  const offset = Math.floor((GLYPH_W - w) / 2)
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < w; gx++) {
      // Majority vote of the pixels inside the cell (area sampling)
      const sx0 = box.x0 + (gx / w) * bw
      const sx1 = box.x0 + ((gx + 1) / w) * bw
      const sy0 = box.y0 + (gy / GLYPH_H) * bh
      const sy1 = box.y0 + ((gy + 1) / GLYPH_H) * bh
      let ink = 0
      let total = 0
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y++)
        for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x++) {
          total++
          if (data[(y * width + x) * 4] === 0) ink++
        }
      out[gy * GLYPH_W + gx + offset] = ink * 2 >= total ? 1 : 0
    }
  }
  return out
}

export function encodeGlyph(g: Uint8Array): string {
  return Array.from(g).join('')
}

export function decodeGlyph(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => (c === '1' ? 1 : 0))
}

/** Intersection-over-union ratio of the ink pixels. */
export function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++
    if (a[i] || b[i]) union++
  }
  return union ? inter / union : 0
}

export type GlyphTemplates = Record<string, string[]>

export interface GlyphMatch {
  digit: number
  score: number
}

export function matchGlyph(glyph: Uint8Array, templates: GlyphTemplates): GlyphMatch | null {
  let best: GlyphMatch | null = null
  for (const [digit, samples] of Object.entries(templates)) {
    for (const sample of samples) {
      const score = iou(glyph, decodeGlyph(sample))
      if (!best || score > best.score) best = { digit: Number(digit), score }
    }
  }
  return best
}
