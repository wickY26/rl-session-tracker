import { clampBox, type Image } from './image'
import type { Box } from './types'

/** Bright green of the party icon; the row backgrounds are blue/orange and text is white. */
function isPartyGreen(r: number, g: number, b: number): boolean {
  return g > 130 && g - r > 45 && g - b > 45
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

/** Ratio above which the strip left of a name holds the party icon (icon fills ~20–35 % of it). */
export const PARTY_MIN_RATIO = 0.06

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
