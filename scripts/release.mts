/**
 * Builds the installer and publishes it as a GitHub release (v<package.json version>) on
 * wickY26/rl-session-tracker, with latest.yml so installed apps see the update.
 *   npm run release
 * Token: GH_TOKEN if set, otherwise the GitHub CLI's login (`gh auth login` once).
 */
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

function token(): string {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    throw new Error('No GitHub token: set GH_TOKEN, or install the GitHub CLI and run `gh auth login`.')
  }
}

const env = { ...process.env, GH_TOKEN: token() }
console.log(`Releasing v${version}…`)
for (const cmd of ['npm run build', 'npx electron-builder --win --publish always']) {
  const res = spawnSync(cmd, { stdio: 'inherit', shell: true, env })
  if (res.status !== 0) process.exit(res.status ?? 1)
}
console.log(`Published v${version}: https://github.com/wickY26/rl-session-tracker/releases`)
