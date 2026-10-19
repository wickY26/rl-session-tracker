import { Jimp } from 'jimp'
import type { Box } from './types'

export type Image = Awaited<ReturnType<typeof Jimp.read>>
/** min: white text (lowest channel), max: bright/colored text (highest channel) */
export type Channel = 'min' | 'max'

/** Fixed width used for layout analysis; all coordinates are on this scale. */
export const NORMAL_WIDTH = 1920

export async function loadNormalized(input: Buffer | string): Promise<Image> {
  const img = await Jimp.read(input as Buffer)
  if (img.bitmap.width !== NORMAL_WIDTH) img.resize({ w: NORMAL_WIDTH })
  return img
}

function channelValues(img: Image, channel: Channel): Uint8Array {
  const d = img.bitmap.data
  const out = new Uint8Array(d.length / 4)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = channel === 'min' ? Math.min(d[i], d[i + 1], d[i + 2]) : Math.max(d[i], d[i + 1], d[i + 2])
  }
  return out
}

export function otsu(values: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of values) hist[v]++
  const total = values.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/**
 * Makes bright text (white in Rocket League) black and everything else white.
 * If no threshold is given, it is computed with Otsu.
 */
export function binarize(img: Image, channel: Channel, threshold?: number): Image {
  const values = channelValues(img, channel)
  const t = threshold ?? otsu(values)
  const d = img.bitmap.data
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = values[p] > t ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }
  return img
}

/**
 * Local-contrast binarization: a pixel is ink when it is brighter than the mean of its
 * (2·radius+1)² neighbourhood by `offset` and above `floor`. Unlike a global threshold this keeps
 * dim text (faded rows of players who left) next to bright text.
 */
export function adaptiveBinarize(img: Image, channel: Channel, radius: number, offset: number, floor: number): Image {
  const { width, height, data } = img.bitmap
  const values = channelValues(img, channel)
  // Integral image for O(1) window sums
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += values[y * width + x]
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row
    }
  }
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const sum =
        integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      const v = values[y * width + x]
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v > mean + offset && v > floor ? 0 : 255
      data[i + 3] = 255
    }
  }
  return img
}

export interface Blob {
  pixels: number[]
  box: Box
}

export function findBlobs(img: Image): Blob[] {
  const { width, height, data } = img.bitmap
  const visited = new Uint8Array(width * height)
  const blobs: Blob[] = []
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || data[start * 4] !== 0) continue
    const pixels: number[] = []
    const stack = [start]
    visited[start] = 1
    const box = { x0: width, y0: height, x1: 0, y1: 0 }
    while (stack.length) {
      const p = stack.pop()!
      pixels.push(p)
      const x = p % width
      const y = (p - x) / width
      box.x0 = Math.min(box.x0, x)
      box.x1 = Math.max(box.x1, x + 1)
      box.y0 = Math.min(box.y0, y)
      box.y1 = Math.max(box.y1, y + 1)
      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]
      for (const n of neighbors) {
        if (n < 0 || n >= width * height || visited[n] || data[n * 4] !== 0) continue
        visited[n] = 1
        stack.push(n)
      }
    }
    blobs.push({ pixels, box })
  }
  return blobs
}

/**
 * Removes noise from a digit cell: uses the tallest blob (a digit) as the reference,
 * erases everything not on the same row and of similar size (row lines, specks),
 * then tightly crops what remains. Returns false if no digit is found.
 */
export function isolateDigits(img: Image): boolean {
  const { width, height, data } = img.bitmap
  const blobs = findBlobs(img)
  // Blobs wider than half the image width are lines, not digits
  const candidates = blobs.filter((b) => b.box.x1 - b.box.x0 < width * 0.5 && b.box.y1 - b.box.y0 < height * 0.95)
  if (!candidates.length) return false
  const main = candidates.reduce((a, b) => (b.box.y1 - b.box.y0 > a.box.y1 - a.box.y0 ? b : a))
  const mainH = main.box.y1 - main.box.y0
  if (mainH < height * 0.15) return false
  const mainCy = (main.box.y0 + main.box.y1) / 2
  const keep = candidates.filter((b) => {
    const h = b.box.y1 - b.box.y0
    const cy = (b.box.y0 + b.box.y1) / 2
    return h >= mainH * 0.6 && Math.abs(cy - mainCy) < mainH * 0.35
  })
  const kept = new Set(keep)
  for (const b of blobs) {
    if (kept.has(b)) continue
    for (const p of b.pixels) data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = 255
  }
  const margin = Math.round(mainH * 0.25)
  const x0 = Math.max(0, Math.min(...keep.map((b) => b.box.x0)) - margin)
  const x1 = Math.min(width, Math.max(...keep.map((b) => b.box.x1)) + margin)
  const y0 = Math.max(0, main.box.y0 - margin)
  const y1 = Math.min(height, main.box.y1 + margin)
  img.crop({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
  return true
}

export function clampBox(box: Box, img: Image): Box {
  const { width, height } = img.bitmap
  return {
    x0: Math.max(0, Math.floor(box.x0)),
    y0: Math.max(0, Math.floor(box.y0)),
    x1: Math.min(width, Math.ceil(box.x1)),
    y1: Math.min(height, Math.ceil(box.y1))
  }
}

export interface Crop {
  png: Buffer
  /** Used to map coordinates in the cropped image back to the original. */
  box: Box
  scale: number
  pad: number
}

export function cropScaled(img: Image, region: Box, scaleFor: (h: number) => number): { piece: Image; box: Box; scale: number } | null {
  const box = clampBox(region, img)
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  if (w < 4 || h < 4) return null
  // jimp's clone() return type doesn't match read()'s type; it is safe since both are the same class
  const piece = img.clone() as Image
  piece.crop({ x: box.x0, y: box.y0, w, h })
  const scale = scaleFor(h)
  if (scale !== 1) piece.resize({ w: Math.round(w * scale), h: Math.round(h * scale) })
  return { piece, box, scale }
}

/** Crops the digit cell, binarizes it and keeps only the digits. Returns null if there are no digits. */
export function prepareDigits(img: Image, region: Box, adaptive = false): Image | null {
  const piece = cropBinarized(img, region, 150, adaptive)
  return piece && isolateDigits(piece) ? piece : null
}

/**
 * Crops a text region, scales it to `height` px and binarizes it: Otsu over the crop, or local contrast
 * when `adaptive` (for dim text or busy backgrounds). Null when too small.
 */
export function cropBinarized(img: Image, region: Box, height = 150, adaptive = false): Image | null {
  const cropped = cropScaled(img, region, (h) => height / h)
  if (!cropped) return null
  return adaptive ? adaptiveBinarize(cropped.piece, 'min', Math.round(height / 2), 25, 55) : binarize(cropped.piece, 'min')
}

export async function toPaddedPng(piece: Image, pad = 12): Promise<Buffer> {
  const canvas = new Jimp({ width: piece.bitmap.width + pad * 2, height: piece.bitmap.height + pad * 2, color: 0xffffffff })
  canvas.composite(piece, pad, pad)
  return canvas.getBuffer('image/png')
}

/** Crops the region, scales it, binarizes it and adds a border. */
export async function cropForOcr(
  img: Image,
  region: Box,
  opts: {
    channel: Channel
    targetHeight?: number
    scale?: number
    threshold?: number
    /** Local-contrast binarization instead of a global threshold (radius in output pixels). */
    adaptive?: { radius: number; offset: number; floor: number }
  }
): Promise<Crop | null> {
  const cropped = cropScaled(img, region, (h) => opts.scale ?? (opts.targetHeight ? opts.targetHeight / h : 1))
  if (!cropped) return null
  const { piece, box, scale } = cropped
  if (opts.adaptive) adaptiveBinarize(piece, opts.channel, opts.adaptive.radius, opts.adaptive.offset, opts.adaptive.floor)
  else binarize(piece, opts.channel, opts.threshold)
  const pad = 12
  return { png: await toPaddedPng(piece, pad), box, scale, pad }
}

export function mapBack(crop: Crop, b: Box): Box {
  const f = (v: number, origin: number) => origin + (v - crop.pad) / crop.scale
  return { x0: f(b.x0, crop.box.x0), y0: f(b.y0, crop.box.y0), x1: f(b.x1, crop.box.x0), y1: f(b.y1, crop.box.y0) }
}

export async function fullBinarized(img: Image, threshold: number): Promise<Buffer> {
  return binarize(img.clone() as Image, 'min', threshold).getBuffer('image/png')
}
