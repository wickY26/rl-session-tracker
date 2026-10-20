/**
 * Starts a release: tags the current commit v<package.json version> and pushes the tag. GitHub Actions
 * (.github/workflows/release.yml) then builds, tests, signs (SignPath, once set up) and publishes it.
 *   npm run release
 * Bump "version" in package.json, commit and push first.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const tag = `v${version}`
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (git('status', '--porcelain')) throw new Error('Uncommitted changes — commit them first: the release is built from the pushed commit.')
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') throw new Error('Release from the main branch.')
git('fetch', 'origin', 'main', '--tags')
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) throw new Error('main is not pushed (or is behind origin) — push first.')
if (git('ls-remote', '--tags', 'origin', tag)) throw new Error(`${tag} already exists — bump "version" in package.json first.`)

git('tag', '-a', tag, '-m', `RL Session Tracker ${version}`)
git('push', 'origin', tag)
console.log(`Pushed ${tag}. Build and publish: https://github.com/wickY26/rl-session-tracker/actions`)
console.log('If signing is set up, approve the signing request in SignPath when it appears.')
