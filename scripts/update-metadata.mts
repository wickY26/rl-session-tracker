/**
 * Writes the auto-update files for an installer: <installer>.blockmap and latest.yml next to it.
 *   npx tsx scripts/update-metadata.mts <path/to/RLSessionTracker-Setup-x.y.z.exe> <version>
 *
 * Code signing changes the installer's bytes, so the files electron-builder made for the unsigned
 * installer no longer match: installed apps would reject the update (sha512 mismatch). The release
 * workflow runs this on the signed installer. Same functions and format as electron-builder (NSIS).
 */
import { writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'

const [installer, version] = process.argv.slice(2)
if (!installer || !version) throw new Error('usage: update-metadata.mts <installer.exe> <version>')

const { sha512, size } = await buildBlockMap(installer, 'gzip', `${installer}.blockmap`)
const name = basename(installer)
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${name}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${name}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n')
writeFileSync(join(dirname(installer), 'latest.yml'), yml)
console.log(yml)
