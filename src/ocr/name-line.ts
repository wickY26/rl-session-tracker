import type { ReadingPlayer } from './types'

export interface NameLine {
  name: string
  mmr: number | null
  mmrDelta: number | null
  /** Club tags such as `CLUB` from `[CLUB]`. */
  tags: string[]
}

// Characters the scoreboard font's digits are misread as (slashed zero Ø → O/@/8/S, 5 → S…)
const DIGIT_LIKE = '0-9OoØøD@QSsBGZz'
const DIGIT_FIX: Record<string, string> = {
  O: '0', o: '0', Ø: '0', ø: '0', D: '0', '@': '0', Q: '0', S: '5', s: '5', B: '8', G: '6', Z: '2', z: '2'
}

/**
 * `[905 + 9]` / `[895 - 17]`: MMR, sign, change. OCR may turn brackets into parentheses/braces/pipes,
 * the minus into a dash or tilde, and drop spaces — all tolerated. The closing bracket is required
 * so a name like `Ollie-1` can't match.
 */
const MMR_RE = new RegExp(
  `[\\[({|lI]?\\s*([${DIGIT_LIKE}]{1,4})\\s*([+\\-–—~÷])\\s*([${DIGIT_LIKE}]{1,3})\\s*[\\])}|lI1]`,
  'g'
)

export interface MmrMatch {
  /** Position and length of the whole bracket in the searched text. */
  index: number
  length: number
  /** Raw OCR characters of the value and the change (their count = digit count). */
  value: string
  change: string
  sign: 1 | -1
}

/** Finds the `[MMR ± change]` bracket in OCR text. */
export function findMmr(text: string): MmrMatch | null {
  for (const m of text.matchAll(MMR_RE)) {
    // At least one real digit in the value, so a tag like [OO-O] isn't taken for MMR
    if (toNumber(m[1]) === null || toNumber(m[3]) === null || !/\d/.test(m[1])) continue
    return { index: m.index!, length: m[0].length, value: m[1], change: m[3], sign: m[2] === '+' || m[2] === '÷' ? 1 : -1 }
  }
  return null
}

function toNumber(text: string): number | null {
  const digits = [...text].map((c) => DIGIT_FIX[c] ?? c).join('')
  return /^\d+$/.test(digits) ? Number(digits) : null
}

/**
 * Parses one scoreboard name line, e.g. `[CLUB] [905 + 9] player_one` → player_one, 905, +9, [CLUB].
 * Lines without an MMR bracket (casual matches) only yield tags and name.
 */
export function parseNameLine(text: string): NameLine {
  const line = text.replace(/\s+/g, ' ').trim()
  let mmr: number | null = null
  let mmrDelta: number | null = null
  // Text before the name: club tags, the MMR bracket and icon junk. The name always comes last.
  let prefix = ''
  let rest = line

  const m = findMmr(line)
  if (m) {
    mmr = toNumber(m.value)
    mmrDelta = m.sign * toNumber(m.change)!
    prefix = line.slice(0, m.index)
    rest = line.slice(m.index + m.length)
  } else {
    // No MMR: the name follows the last closing bracket (club tag), if any
    const close = Math.max(line.lastIndexOf(']'), line.lastIndexOf(')'), line.lastIndexOf('}'))
    if (close !== -1) {
      prefix = line.slice(0, close + 1)
      rest = line.slice(close + 1)
    }
  }

  const tags = [...prefix.matchAll(/[[({]([^\])}[({]*)[\])}]/g)].map((t) => t[1].trim()).filter(Boolean)
  // Icons left of the name come through as junk symbols; names start with a letter, digit or underscore
  const name = rest
    .replace(/^[^A-Za-z0-9_]+/, '')
    .replace(/[^A-Za-z0-9_.\-]+$/, '')
    // A lone trailing character after a space is the MVP star or ping icon, not part of the name
    .replace(/\s+[^\s_]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { name, mmr, mmrDelta, tags }
}

/** Casual match: nobody on the scoreboard shows an MMR bracket. */
export function isCasual(players: readonly Pick<ReadingPlayer, 'mmr'>[]): boolean {
  return players.every((p) => p.mmr === null)
}
