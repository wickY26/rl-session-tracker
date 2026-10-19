/**
 * Builds the installer and publishes it as GitHub release v<package.json version> on
 * wickY26/rl-session-tracker, together with latest.yml so installed apps see the update.
 *   npm run release
 * Needs the GitHub CLI signed in (`gh auth login`, or GH_TOKEN set). Commit and push first:
 * the release tag is created on the remote main branch.
 *
 * The upload is done by `gh release create` in one call: electron-builder's own publishing
 * creates the release from parallel uploads and fails with "Published releases must have a valid tag".
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const REPO = 'wickY26/rl-session-tracker'
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const tag = `v${version}`

/** `gh` on PATH, or the installer's default location (PATH may predate the install). */
function gh(): string {
  for (const candidate of ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' })
      return candidate
    } catch {
      // try the next one
    }
  }
  throw new Error('GitHub CLI not found: install it and run `gh auth login`.')
}

const run = (cmd: string, args: string[]) => {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const ghBin = gh()
const exists = spawnSync(ghBin, ['release', 'view', tag, '-R', REPO], { stdio: 'ignore' }).status === 0
if (exists) throw new Error(`${tag} is already released — bump "version" in package.json first.`)

console.log(`Building ${tag}…`)
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dist'])

const files = [`release/RLSessionTracker-Setup-${version}.exe`, `release/RLSessionTracker-Setup-${version}.exe.blockmap`, 'release/latest.yml']
for (const f of files) if (!existsSync(f)) throw new Error(`missing build output: ${f}`)
if (!readFileSync('release/latest.yml', 'utf8').includes(`version: ${version}`)) throw new Error('release/latest.yml is not for this version')

console.log(`Publishing ${tag}…`)
run(ghBin, ['release', 'create', tag, ...files, '-R', REPO, '--target', 'main', '--title', tag, '--notes', `RL Session Tracker ${version}`])
console.log(`Published ${tag}: https://github.com/${REPO}/releases/tag/${tag}`)
