import type { StatKey } from '../../core/types'

export const STAT_LABELS: Record<StatKey, string> = {
  score: 'Score',
  goals: 'Goals',
  assists: 'Assists',
  saves: 'Saves',
  shots: 'Shots'
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}
