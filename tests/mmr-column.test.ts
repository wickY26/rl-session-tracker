import { describe, expect, it } from 'vitest'
import { signFromColor } from '../src/ocr/mmr-column'

describe('MMR change sign from colour', () => {
  it('gold is up, red is down — faded rows too', () => {
    expect(signFromColor({ r: 236, g: 196, b: 70 })).toBe(1)
    expect(signFromColor({ r: 140, g: 118, b: 52 })).toBe(1)
    expect(signFromColor({ r: 232, g: 64, b: 60 })).toBe(-1)
    expect(signFromColor({ r: 130, g: 40, b: 38 })).toBe(-1)
  })
})
