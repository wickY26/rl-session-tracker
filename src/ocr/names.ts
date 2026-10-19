import { levenshtein, similarity } from '../core/text'

/** Whether a word is an expected label (tolerates 1–2 OCR letter errors). */
export function isLabel(text: string, label: string): boolean {
  const token = text.toUpperCase().replace(/[^A-Z]/g, '')
  if (token.length < label.length - 2) return false
  return levenshtein(token, label) <= (label.length >= 6 ? 2 : 1)
}

/** Comparable form of a player name: lowercase letters and digits only. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Index of the name that best matches the account name, or -1 when none is close enough. */
export function findAccount(names: readonly string[], accountName: string, minScore = 0.6): number {
  const target = nameKey(accountName)
  let best = -1
  let bestScore = minScore
  names.forEach((name, i) => {
    const key = nameKey(name)
    const score = key.includes(target) && target.length >= 3 ? 1 : similarity(key, target)
    if (score >= bestScore && (best === -1 || score > bestScore)) {
      best = i
      bestScore = score
    }
  })
  return best
}
