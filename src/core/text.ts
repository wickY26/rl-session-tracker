export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** 0..1 similarity. */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

// Characters the scoreboard OCR confuses with each other, folded to one representative
const CONFUSABLE: Record<string, string> = { '0': 'o', 'ø': 'o', '1': 'l', i: 'l', '|': 'l', '5': 's', '8': 'b' }

/** Lowercase name with OCR-confusable characters folded, for comparing two readings of the same name. */
export function foldName(name: string): string {
  return [...name.toLowerCase().trim()].map((c) => CONFUSABLE[c] ?? c).join('')
}
