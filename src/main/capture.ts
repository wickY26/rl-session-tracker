import { desktopCapturer, screen, type NativeImage } from 'electron'
import { knownTeammates, snapTeammateName } from '../core/teams'
import type { Match } from '../core/types'
import type { ScoreboardReading } from '../ocr/types'

/** Grabs the display the cursor is on (where the game runs) at full resolution. */
export async function grabScreen(): Promise<NativeImage> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source) throw new Error('No screen found')
  return source.thumbnail
}

/**
 * Snaps my premade teammates' OCR'd names to teammates seen before, so OCR noise
 * (ZeNaThEoMnIiGoD) doesn't split one friend into several teams.
 */
export function snapTeammates(reading: ScoreboardReading, matches: readonly Match[]): ScoreboardReading {
  if (!reading.me) return reading
  const known = knownTeammates(matches)
  if (!known.length) return reading
  const me = reading.me
  const teams = reading.teams.map((team, ti) =>
    ti !== me.team
      ? team
      : {
          ...team,
          players: team.players.map((p, i) =>
            i !== me.index && p.party ? { ...p, name: snapTeammateName(p.name, known) } : p
          )
        }
  ) as ScoreboardReading['teams']
  return { ...reading, teams }
}
