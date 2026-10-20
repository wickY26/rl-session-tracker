import { Jimp } from 'jimp'
import { describe, expect, it } from 'vitest'
import type { Image } from '../src/ocr/image'
import { greenRatio, hasPartyIcon, isPartyGreen, partyRegion, PARTY_MIN_RATIO } from '../src/ocr/party-icon'

const BLUE_ROW = 0x1e3c8cff
const PARTY_GREEN = 0x6ccf3cff

function row(): Image {
  return new Jimp({ width: 200, height: 60, color: BLUE_ROW }) as unknown as Image
}

function paint(img: Image, x0: number, y0: number, w: number, h: number, color: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.setPixelColor(color, x, y)
}

describe('party icon', () => {
  const h = 13
  const center = 35
  const nameX = 120

  it('is detected when a green icon sits just left of the name', () => {
    const img = row()
    const r = partyRegion(nameX, center, h)
    paint(img, Math.round(r.x0) + 8, Math.round(r.y0) + 6, 18, 18, PARTY_GREEN)
    expect(greenRatio(img, r)).toBeGreaterThan(PARTY_MIN_RATIO)
    expect(hasPartyIcon(img, nameX, center, h)).toBe(true)
  })

  it('is not detected on a plain row or with white text only', () => {
    const img = row()
    paint(img, 90, 20, 25, 14, 0xffffffff)
    expect(hasPartyIcon(img, nameX, center, h)).toBe(false)
  })

  it('ignores green far left of the name (ready checkmark, avatar)', () => {
    const img = row()
    paint(img, 10, 15, 30, 30, PARTY_GREEN)
    expect(hasPartyIcon(img, nameX, center, h)).toBe(false)
  })

  it('matches the faded icon of a player who left, not the pitch or row colours', () => {
    expect(isPartyGreen(42, 176, 0)).toBe(true)
    expect(isPartyGreen(21, 81, 7)).toBe(true)
    expect(isPartyGreen(47, 84, 4)).toBe(true)
    expect(isPartyGreen(40, 90, 40)).toBe(false)
    expect(isPartyGreen(79, 86, 56)).toBe(false)
    expect(isPartyGreen(30, 60, 160)).toBe(false)
    expect(isPartyGreen(200, 110, 30)).toBe(false)
  })
})
