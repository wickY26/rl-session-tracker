import { describe, expect, it } from 'vitest'
import { isChangeRed, signFromColor } from '../src/ocr/mmr-column'

describe('MMR change colour', () => {
  it('red digits are red, also when faded', () => {
    expect(isChangeRed(238, 73, 79)).toBe(true)
    expect(isChangeRed(138, 65, 50)).toBe(true)
  })

  it('an orange particle trail, gold and white are not red', () => {
    expect(isChangeRed(230, 140, 40)).toBe(false)
    expect(isChangeRed(243, 230, 135)).toBe(false)
    expect(isChangeRed(240, 240, 240)).toBe(false)
  })

  it('sign: gold (also faded towards grey) is up, red is down', () => {
    expect(signFromColor({ r: 243, g: 230, b: 135 })).toBe(1)
    expect(signFromColor({ r: 116, g: 119, b: 115 })).toBe(1)
    expect(signFromColor({ r: 130, g: 70, b: 60 })).toBe(-1)
  })
})
