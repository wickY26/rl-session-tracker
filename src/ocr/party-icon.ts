import { clampBox, type Image } from './image'
import type { Box } from './types'

/**
 * Green of the party icon: bright (~42,176,0) on normal rows, dim (~21,81,7) on faded rows of players
 * who left (pulled towards olive on orange rows, ~62,80,18). Relative test, and almost no blue: the green
 * pitch showing through faded rows (~40,90,40) and the blue/orange row backgrounds don't match.
 */
export function isPartyGreen(r: number, g: number, b: number): boolean {
  return g >= 55 && r < g * 0.8 && b < g * 0.35
}

/** Share of party-green pixels in the region. */
export function greenRatio(img: Image, region: Box): number {
  const box = clampBox(region, img)
  const { width, data } = img.bitmap
  let green = 0
  let total = 0
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * width + x) * 4
      total++
      if (isPartyGreen(data[i], data[i + 1], data[i + 2])) green++
    }
  return total ? green / total : 0
}

/**
 * Share of green above which the strip left of a name holds the party icon. Measured on all fixtures:
 * rows without the icon 0.000, rows with it 0.048–0.19 (faded rows at the low end).
 */
export const PARTY_MIN_RATIO = 0.02

/**
 * Region just left of the name where the party icon sits (between avatar and name).
 * `nameX` is where the name text starts, `rowCenter` the row's digit center, `h` the header height.
 */
export function partyRegion(nameX: number, rowCenter: number, h: number): Box {
  return { x0: nameX - h * 2.8, y0: rowCenter - h * 1.8, x1: nameX - h * 0.15, y1: rowCenter + h * 0.6 }
}

export function hasPartyIcon(img: Image, nameX: number, rowCenter: number, h: number): boolean {
  return greenRatio(img, partyRegion(nameX, rowCenter, h)) >= PARTY_MIN_RATIO
}
