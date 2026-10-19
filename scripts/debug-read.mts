/**
 * Reads one screenshot and prints the result — for tuning the OCR.
 *   npx tsx scripts/debug-read.mts <image> <accountName> [--debug <dir>]
 */
import { readFileSync } from 'node:fs'
import templates from '../src/ocr/digit-templates.json' with { type: 'json' }
import { ScoreboardReader } from '../src/ocr/reader'

const [file, accountName] = process.argv.slice(2)
const debugDir = process.argv.includes('--debug') ? process.argv[process.argv.indexOf('--debug') + 1] : undefined
const reader = new ScoreboardReader({
  langPath: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int',
  accountName,
  templates,
  debugDir
})
const started = Date.now()
const reading = await reader.read(readFileSync(file))
await reader.dispose()
console.log(`${Date.now() - started} ms`)
console.log(`mode=${reading.mode} winner=${reading.winner} casual=${reading.casual} me=${JSON.stringify(reading.me)} fatal=${reading.fatal}`)
for (const [ti, team] of reading.teams.entries()) {
  console.log(`team ${ti} ${team.color} goals=${team.goals}`)
  for (const p of team.players) {
    const s = p.stats
    console.log(`  ${p.party ? 'P' : ' '} ${p.name.padEnd(18)} mmr=${p.mmr} ${p.mmrDelta}  ${s.score} ${s.goals} ${s.assists} ${s.saves} ${s.shots}   | ${p.rawLine}`)
  }
}
for (const w of reading.warnings) console.log(`! ${w}`)
