import { STAT_KEYS, type StatKey } from '../core/types'
import { isLabel } from './names'
import type { Box, TeamColor, Word } from './types'

const HEADER_LABELS: Record<StatKey, string> = {
  score: 'SCORE',
  goals: 'GOALS',
  assists: 'ASSISTS',
  saves: 'SAVES',
  shots: 'SHOTS'
}

export interface TeamBlock {
  /** Box of the column header row. */
  header: Box
  headerHeight: number
  /** Center x of each stat column. */
  columns: Record<StatKey, number>
  spacing: number
  label: Word | null
  color: TeamColor | null
}

export interface Layout {
  width: number
  height: number
  teams: [TeamBlock, TeamBlock]
}

const cy = (b: Box) => (b.y0 + b.y1) / 2
const cx = (b: Box) => (b.x0 + b.x1) / 2

function headerKey(text: string): StatKey | null {
  for (const key of STAT_KEYS) if (isLabel(text, HEADER_LABELS[key])) return key
  return null
}

interface HeaderHit {
  key: StatKey
  word: Word
}

function groupHeaders(words: Word[]): HeaderHit[][] {
  const hits: HeaderHit[] = []
  for (const word of words) {
    const key = headerKey(word.text)
    if (key) hits.push({ key, word })
  }
  hits.sort((a, b) => cy(a.word.box) - cy(b.word.box))
  const groups: HeaderHit[][] = []
  for (const hit of hits) {
    const h = hit.word.box.y1 - hit.word.box.y0
    const group = groups.find((g) => Math.abs(cy(g[0].word.box) - cy(hit.word.box)) < h)
    if (group) group.push(hit)
    else groups.push([hit])
  }
  return groups.filter((g) => new Set(g.map((h) => h.key)).size >= 3)
}

/** Fits x = a + b*i through the found headers and fills in missing columns. */
function fitColumns(group: HeaderHit[]): { columns: Record<StatKey, number>; spacing: number } {
  const points = new Map<number, number>()
  for (const hit of group) points.set(STAT_KEYS.indexOf(hit.key), cx(hit.word.box))
  const xs = [...points.keys()]
  const ys = [...points.values()]
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const b = num / den
  const a = my - b * mx
  const columns = {} as Record<StatKey, number>
  STAT_KEYS.forEach((key, i) => {
    columns[key] = points.get(i) ?? a + b * i
  })
  return { columns, spacing: b }
}

function unionBox(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1))
  }
}

function findLabel(words: Word[], header: Box, headerHeight: number, scoreX: number): { label: Word; color: TeamColor } | null {
  let best: { label: Word; color: TeamColor; dist: number } | null = null
  for (const word of words) {
    const color: TeamColor | null = isLabel(word.text, 'ORANGE') ? 'orange' : isLabel(word.text, 'BLUE') ? 'blue' : null
    if (!color || word.box.x1 > scoreX) continue
    const dist = Math.abs(cy(word.box) - cy(header))
    if (dist > headerHeight * 5) continue
    if (!best || dist < best.dist) best = { label: word, color, dist }
  }
  return best && { label: best.label, color: best.color }
}

export function findLayout(words: Word[], width: number, height: number): Layout | null {
  const groups = groupHeaders(words)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .sort((a, b) => cy(a[0].word.box) - cy(b[0].word.box))
  if (groups.length < 2) return null

  const teams = groups.map((group): TeamBlock => {
    const header = unionBox(group.map((h) => h.word.box))
    const headerHeight = Math.max(...group.map((h) => h.word.box.y1 - h.word.box.y0))
    const { columns, spacing } = fitColumns(group)
    const found = findLabel(words, header, headerHeight, columns.score)
    return { header, headerHeight, columns, spacing, label: found?.label ?? null, color: found?.color ?? null }
  })
  const [a, b] = teams
  if (!a.color && b.color) a.color = b.color === 'orange' ? 'blue' : 'orange'
  if (!b.color && a.color) b.color = a.color === 'orange' ? 'blue' : 'orange'
  return { width, height, teams: [a, b] }
}

/** Box of the team label (BLUE/ORANGE); estimated from the header when not found. */
export function labelBox(team: TeamBlock): Box {
  if (team.label) return team.label.box
  const h = team.headerHeight * 2.6
  return {
    x0: team.columns.score - team.spacing * 4.2,
    y0: team.header.y1 - h,
    x1: team.columns.score - team.spacing * 2.5,
    y1: team.header.y1
  }
}

/** Lowest y the team's rows may reach: just above the next team's label, or the image bottom. */
function rowsLimit(layout: Layout, index: 0 | 1): number {
  const team = layout.teams[index]
  const limit = index === 0 ? labelBox(layout.teams[1]).y0 - team.headerHeight * 0.3 : layout.height
  return Math.min(team.header.y1 + team.headerHeight * 16, limit)
}

/** Vertical strip of the SCORE column below the header; every player row has a number there. */
export function scoreStrip(layout: Layout, index: 0 | 1): Box {
  const team = layout.teams[index]
  const half = team.spacing * 0.45
  return { x0: team.columns.score - half, y0: team.header.y1 + team.headerHeight * 0.5, x1: team.columns.score + half, y1: rowsLimit(layout, index) }
}

/**
 * Name area of one row (left of SCORE). It covers the name line and the player title below it;
 * it starts at the team label so the avatar and party icon are included (the reader skips them),
 * and ends before the MVP star that sits between the name and SCORE.
 */
export function nameBand(layout: Layout, index: 0 | 1, rowCenter: number): Box {
  const team = layout.teams[index]
  const h = team.headerHeight
  return { x0: labelBox(team).x0, y0: rowCenter - h * 2.1, x1: team.columns.score - team.spacing * 0.85, y1: rowCenter + h * 1.9 }
}

/** One stat cell of a row, centered on the row's digits. */
export function cellBox(team: TeamBlock, key: StatKey, rowCenter: number): Box {
  const h = team.headerHeight
  const half = team.spacing * 0.42
  return { x0: team.columns[key] - half, y0: rowCenter - h * 1.7, x1: team.columns[key] + half, y1: rowCenter + h * 1.7 }
}

/** The "WINNER" strip above the team label. */
export function bannerBox(team: TeamBlock): Box {
  const label = labelBox(team)
  const lh = label.y1 - label.y0
  return { x0: label.x0 - lh * 2, y0: label.y0 - lh * 1.1, x1: label.x0 + lh * 7, y1: label.y0 - lh * 0.05 }
}
