# Spec: RL Session Tracker

Confirmed intent: [docs/intent/rl-session-tracker.md](docs/intent/rl-session-tracker.md) · Foundation: `../noob-league` (capture + OCR)

## Objective
A Windows desktop app that tracks **one player's** Rocket League competitive matches (1v1 / 2v2 / 3v3) from end-of-match
scoreboard screenshots. Press a hotkey on the scoreboard → OCR reads every player's name, MMR (`[905 + 9]`), stats and party
icon → confirm card → save. History is never reset. The app shows the active session (grouped by mode), a long-term
dashboard (MMR per mode over time), premade teams, and an always-on in-game overlay.

Each install is independent: one local data folder, one account name set at first run. Distributed as an installer
published on GitHub Releases; the app checks for updates.

### User stories
- As a player, I press `F8` on the scoreboard and within ~5 s a card shows the match read correctly; `F8` again saves it.
- During a session I see W–L, MMR change and averages **per mode** at the top of the main screen, and the same essentials on an overlay over the game.
- Between sessions I open the dashboard and see my 2v2 MMR line over the last months, with session boundaries.
- I pick a premade team (e.g. me + friendX, 2v2) and see our record, win rate, MMR change and average stats together.
- I hide a team I don't care about from the Teams tab; I can show it again later.

## Tech Stack
Same as noob-league (versions pinned as there):
- Electron 41 + electron-vite 5, React 18, TypeScript (strict)
- OCR: tesseract.js 7 (bundled `eng` data, offline) + digit glyph templates; image processing: jimp 1.6
- Test: Vitest 3 · Packaging: electron-builder 26 → NSIS installer
- **New:** `electron-updater` (GitHub Releases provider) for update checks

## Commands
```
Install:    npm install
Dev:        npm run dev
Test:       npm test              (vitest run)
Typecheck:  npm run typecheck
Build:      npm run build         (electron-vite build)
Package:    npm run dist          (build + electron-builder --win)
Release:    npm run release       (dist + publish to GitHub Releases; needs GH_TOKEN)
Templates:  npm run templates     (rebuild digit templates from fixtures/)
```

## Project Structure
```
src/core/        → tracker-core: types, sessions, per-mode stats, teams, MMR series (pure TS, no electron)
src/ocr/         → scoreboard-ocr: image → ScoreboardReading (copied from noob-league, adapted)
src/main/        → Electron main: hotkeys, capture, confirm/overlay windows, storage, session timer, updater, tray
src/preload/     → contextBridge API
src/shared/      → IPC types shared by main and renderer
src/renderer/    → React UI: main window, confirm card, overlay (three entry points)
tests/           → Vitest tests
fixtures/        → real screenshots + expected .json (OCR tests)
docs/intent/     → confirmed intent
```

## Capability map
| Module id | Responsibility | Depends on |
|---|---|---|
| `tracker-core` | Data model, session open/close rules, per-mode session stats, MMR series, team derivation, streaks | — |
| `scoreboard-ocr` | Image → `ScoreboardReading`: rows (1–3 per team), names, MMR + delta, party icon, stats, winner | — |
| `capture` | Hotkeys, screen grab, confirm card, save/undo, storage + backup, session idle timer, tray, autostart | core, ocr |
| `app-ui` | First-run setup, Session view, Dashboard, Matches (edit/delete), Teams, Settings | core, capture |
| `overlay` | Always-on-top click-through window with live session summary + its settings | core, capture |
| `updater` | Update check on startup / every 6 h, "update available" banner, install on confirm | capture |

Build order: `tracker-core` + `scoreboard-ocr` (parallel) → `capture` → `app-ui` → `overlay`, `updater`.

### Reuse from noob-league
| Take (copy & adapt) | Drop |
|---|---|
| `ocr/image.ts`, `ocr/glyphs.ts`, `ocr/names.ts` (levenshtein, similarity, isLabel), `ocr/layout.ts` (header/column anchoring, WINNER banner), `scripts/build-templates.mts` | `main/publisher.ts`, `main/web-sync.ts`, `src/web/`, `shared/web.ts` |
| `main/index.ts` capture flow: hotkeys, non-focus confirm card, sounds, tray, autostart, self-test mode | `core/league.ts` (series, standings, day winner), `core/insights.ts` |
| `main/storage.ts` (atomic write + `.bak`), `renderer/components/LineChart.tsx`, `Confirm.tsx` editing UX | Fixed 4-player name list, seasons, series logic |

It is a copy, not a shared package: the two apps evolve independently.

## Data model (`src/core/types.ts`)
```ts
export type Mode = '1v1' | '2v2' | '3v3'
export const STAT_KEYS = ['score', 'goals', 'assists', 'saves', 'shots'] as const

export interface PlayerLine extends Stats {
  name: string            // as read/corrected; tags in brackets stripped
  mmr: number | null      // number shown in [905 + 9] → 905
  mmrDelta: number | null // +9 / -17
  party: boolean          // green party icon next to the name
}

export interface Match {
  id: string
  recordedAt: string      // ISO
  sessionId: string
  mode: Mode              // rows per team
  playlist: string        // 'doubles' etc.; defaults from mode, lets extra ranked modes (Hoops, Rumble…) be split later without migration
  teams: [TeamResult, TeamResult] // TeamResult = { goals, players: PlayerLine[] }
  winner: 0 | 1
  me: { team: 0 | 1; index: number } // located by account name
  screenshot: string | null          // relative path under data/screenshots
}

export interface Session { id: string; startedAt: string; endedAt: string | null; endReason: 'manual' | 'idle' | null }

export interface TrackerData {
  schemaVersion: 1
  sessions: Session[]
  matches: Match[]
  untrackedTeams: string[] // team keys hidden in the Teams tab
}
```
Settings (separate `settings.json`): `accountName`, `startingMmr: Partial<Record<Mode, number>>`, `sessionIdleMinutes` (120),
`hotkeys`, `overlay: { enabled, corner, offsetX, offsetY, opacity, scale }`, `keepScreenshots` (true), `autostart`.

Storage: `%APPDATA%/rl-session-tracker/data/` → `tracker.json` (+ `.bak` before every write), `settings.json`, `screenshots/`.
Format changes bump `schemaVersion` with a migration.

## tracker-core rules
- **Derived, not stored:** session stats, teams, MMR series and streaks are computed from `matches` (same principle as
  noob-league's series), so editing/deleting a match recomputes everything consistently.
- **MMR is per mode.** Never summed or averaged across modes. The shown MMR is the value **after** the match
  (confirmed); before = `mmr − mmrDelta`.
- **Session open/close:**
  - Start: button/hotkey, or automatically when a match is saved with no active session.
  - End: button/hotkey, or auto-close when `now − (last match time ?? startedAt) > sessionIdleMinutes`.
    Auto-closed sessions get `endedAt = last match time` (not the moment the timer noticed) and `endReason = 'idle'`.
  - Checked when a match is saved and by a 1-minute timer in main (so the overlay updates).
  - Ending an empty session deletes it.
- **Session stats per mode** (only modes played): matches, W–L, win %, MMR start → end and Δ (sum of my deltas),
  current streak, averages of my score/goals/assists/saves/shots, MVP count (top score on the winning team).
- **Teams:** team key = `mode + sorted lowercase names of my teammates`. A match forms a team only if **every** teammate
  of mine has `party = true` (1v1 never forms a team). Opponents are ignored. Team stats: matches, W–L, win %,
  my MMR Δ while together, my averages and each teammate's averages. `untrackedTeams` hides a team (and stops it showing
  as "new"); matches are never touched.
- **Teammate name drift:** when reading a party teammate, the name is snapped to an existing teammate name when both
  are equal after folding OCR-confusable characters (0/O, 1/l/I, 5/S, 8/B), or — for names of 10+ characters — differ
  by one character after folding. Short names need an exact fold match (`wicky26` never becomes `wicky27`).
  The confirm card shows the snapped name.
- **Duplicate guard:** same mode + same names + same stats as an already saved match → warning on the card.

## scoreboard-ocr rules
- Anchors from noob-league: `SCORE/GOALS/ASSISTS/SAVES/SHOTS` headers → columns; `BLUE/ORANGE` labels; `WINNER` banner → winner.
- **Rows are not found by known names any more.** 1–3 rows per team, located from digit blobs in the SCORE column
  (local-contrast threshold, so faded rows count) and confirmed by digits in ≥ 3 other stat columns (filters accolade
  popups and header text). Both teams must have the same row count (else warning). Mode = row count.
- **Name text** is read per row from a band left of SCORE (ending before the MVP star) with local-contrast
  binarization — handles faded rows and the ball behind a name. The name line is the one with the most letters at
  or above the row center (the title sits below).
- **Player titles** under names (`FORK IN THE ROAD`, `S24 WINS: 215`, `LEGEND`) are ignored: smaller line height,
  directly below the name line.
- **MMR, current layout:** a column left of each row, before the rank emblem: `+9 1273` = change and MMR
  **after** the match. Digits are read with the stat-column templates (same font); a very thin glyph is a `1`
  (the change font's `1` is lighter). The sign comes from colour: gold = up, red = down.
- **MMR, older layout (fallback):** inside the name, `[905 + 9] player_one`. Name-line parsing (pure, unit-tested)
  strips club tags (`[CLUB]`, `[ABC]`), extracts `[<digits> ± <digits>]` normalizing Ø/O → 0; remaining text = name.
- If no player has an MMR (column or bracket) → `casual: true` and the card says "Casual match — not saved".
- **Team label** can be a club name (`BACK`) instead of BLUE/ORANGE; the label box then comes from the header geometry
  and the colour from the other team.
- **MMR digits** are re-read with the stat-column digit templates (same typeface, scale-free) from the bracket's
  word boxes: Tesseract reads this font's slashed zero `Ø` as 8/@/S. Tesseract's text is only the fallback.
- **Me:** the row whose name best matches `accountName` (fuzzy, ≥ 0.6); that row's name is shown as the account name.
  Not found → warning "Account not found on the scoreboard" (blocks saving).
- **Faded rows** (players who left) are read with the same accuracy as bright ones — contrast normalization per row.
- **Party icon:** green-pixel detection in the strip between avatar and name (pure function on an image crop).
- Digits in stat columns use the existing template matcher; templates are regenerated from the new fixtures
  (resolutions seen: 1920×1080, 2000×1125, plus noob-league's 1600×900).
- Unreadable fields → `null`; the reader leaves a value empty rather than guess. **Required to save: only my row and
  the winner** (both come from the screenshot nearly always), so F8 never stops a session for typing. Every other value
  — names, MMR, stats, mine included — may be empty: the card marks it amber, the match is saved, and it shows a
  **Needs review** badge (Session/Matches) that opens the editor. Stats and averages skip empty values.

## Behaviour
| Key (default, configurable) | Action |
|---|---|
| `F8` | Read screen → confirm card. With card open: save |
| `F7` | Cancel card (passed through to the game when no card) |
| `F9` | Start / end session |
| `Ctrl+F7` | Undo last saved match (press twice within 5 s) |
| `F10` | Toggle overlay |

- Confirm card: top-right, no focus steal, editable on click, Enter = save, Esc = cancel (noob-league UX).
  Shows mode, winner, every row (name, MMR ± delta, party ✓, stats), me highlighted, warnings.
- **Main window:**
  - Active session → **Session view**: per-mode tabs/sections (only modes played) with summary tiles on top
    (MMR Δ and start→end, W–L, win %, streak, avg score/goals/assists/saves/shots) then the match list.
  - No active session → **Dashboard**: per-mode cards (current MMR, peak, W–L, win %), MMR line per mode
    (x = match, session boundaries marked, range: 30 days / 90 days / all), past sessions list (click → session view).
  - Tabs: Session · Dashboard · Matches (edit/delete) · Teams · Settings.
- **Teams tab:** tracked teams sorted by matches; click → team stats; "Untrack" / "Show untracked".
- **Overlay:** transparent, frameless, `alwaysOnTop('screen-saver')`, click-through, non-focusable, on the primary
  display. Shows mode of the last saved match: `2v2 · 5W–2L · +41 · W3`; other modes played this session in a
  smaller line. No session → "No active session". Settings: on/off, corner, offset, opacity (20–100 %), scale.
  Refreshes on save/undo/edit/session change. The overlay window is excluded from screen capture
  (content protection), so it never ends up in a scoreboard screenshot — it also won't show in display-capture recordings.
- **First run:** setup screen — account name (required), starting MMR per mode (optional), hotkey list, Borderless reminder.
- **Updates:** check on startup and every 6 h; banner "Version x.y.z available — Restart & install". Never installs
  without confirmation, never auto-restarts during an active session.
- Closing the window minimizes to tray; autostart with Windows optional.

## Code Style
```ts
/** Per-mode summary of one session. Pure: derived from saved matches only. */
export function sessionSummary(matches: readonly Match[], mode: Mode): ModeSummary {
  const mine = matches.filter((m) => m.mode === mode)
  const wins = mine.filter(isWin).length
  return {
    mode,
    wins,
    losses: mine.length - wins,
    mmrDelta: sum(mine.map((m) => myLine(m).mmrDelta ?? 0)),
    streak: currentStreak(mine)
  }
}
```
- Pure logic in `src/core` and pure parts of `src/ocr`; side effects (files, electron, timers) only in `src/main`.
- camelCase functions/variables, PascalCase types/components, kebab-case files.
- UI text in English. Code comments in English.

## Testing Strategy
- `tracker-core` (required, Vitest): session auto-close incl. `endedAt` = last match, per-mode summaries with mixed
  modes, MMR series, streaks, team derivation (all-party rule, 3v3 with one random → no team, 1v1 → none),
  untrack, name snapping, duplicate detection, edit/delete recomputation.
- `scoreboard-ocr`: name-line parser and party-icon detector as pure unit tests; fixture integration test per
  screenshot (`fixtures/*.jpg` + expected `.json`) — every name, MMR, delta, party flag and stat.
- Minimum fixture set before OCR is "done": 1v1, 2v2, 3v3; a win and a loss (negative delta); faded rows; casual;
  at least two resolutions.
- capture / UI / overlay / updater: manual verification via `npm run dev` and the self-test mode.

## Boundaries
- **Always:** `npm test` + `npm run typecheck` pass before a task counts as done; backup before every data write;
  every OCR fix comes with a fixture.
- **Ask first:** new dependencies beyond `electron-updater`; data format changes (need a migration);
  git commit/push; publishing a release.
- **Never:** silently delete or overwrite user data; OCR that needs internet; reading game memory or using
  BakkesMod/third-party APIs; auto-installing updates without consent.

## Success Criteria
- `F8` → confirm card filled within 5 s; on every fixture, all names, MMR values, deltas, party flags and stats are correct.
- A casual screenshot is rejected with a clear message and nothing is saved.
- A session with mixed 2v2 + 3v3 matches shows separate tiles per mode whose numbers match a hand calculation.
- After 2 h without a save the session closes on its own with `endedAt` = last match time.
- A 2v2 premade with all-party teammates appears in Teams; a 3v3 with one random does not; untracking hides it and re-tracking restores it.
- The overlay is visible over Rocket League (Borderless), never takes clicks or focus, and updates within 1 s of a save.
- `npm run dist` produces an installer; an installed older version detects a newer GitHub release and installs it after confirmation.

## Open Questions
1. ~~MMR before or after?~~ **Resolved:** the shown MMR is the rating after the match; ±N is the change.
2. **Extra ranked modes** (Hoops 2v2, Rumble / Dropshot / Snow Day 3v3) also show MMR and look like 2v2/3v3 by row count.
   Track them, ignore them, or let the card pick the playlist? Proposal: card has a playlist dropdown defaulting from row
   count, plus a warning when my MMR jumps > 150 from that mode's last value.
3. **Releases repo:** which GitHub account/repo hosts the installer releases? It must be public for unauthenticated update checks. Unsigned installers will show a SmartScreen warning on first install.
4. **Running next to noob-league:** both use F8/F7/F9 as global hotkeys; only one app can own a key. Hotkeys are configurable — pick different defaults?
5. **Screenshot disk use:** ~200–300 KB per match kept forever. Keep all (default), or add "delete screenshots older than N days"?
6. **More fixtures needed:** 1v1, 3v3, a loss, and another resolution — please collect a few during the next sessions.
