# Tasks: RL Session Tracker

Plan: [plan.md](plan.md) · Spec: [../SPEC.md](../SPEC.md). Source to copy from: `../noob-league`.
Every task: `npm test` + `npm run typecheck` green before it counts as done (spec Boundaries).

---

## Phase 1 — Foundation

### T1: Scaffold the project
**Description:** Create the Electron + electron-vite + React + TS project by copying noob-league's configs, renamed
(`rl-session-tracker`, appId `com.rlsessiontracker.app`, product "RL Session Tracker"). Main process opens one empty window. No business code.
**Acceptance:**
- [x] `npm install`, `npm run typecheck`, `npm test` (one trivial test) succeed
- [x] `npm run dev` opens a window titled "RL Session Tracker"
- [x] `.gitignore` excludes `node_modules`, `out`, `release`
**Verify:** commands above + manual window check
**Depends on:** —
**Files:** `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `electron-builder.yml`, `src/main/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`
**Scope:** M

### T2: Core types + session rules
**Description:** `src/core/types.ts` (Mode, Playlist, PlayerLine, Match, Session, TrackerData, Settings) and `src/core/sessions.ts`:
start, end, auto-start on save, idle auto-close (`endedAt` = last match time, `endReason: 'idle'`), empty session removed on end.
**Acceptance:**
- [x] Saving with no active session opens one; saving after > idle minutes closes the old one at its last match time and opens a new one
- [x] Ending an empty session removes it; ending a non-empty one sets `endReason: 'manual'`
**Verify:** `npx vitest run tests/sessions.test.ts`
**Depends on:** T1
**Files:** `src/core/types.ts`, `src/core/sessions.ts`, `tests/sessions.test.ts`
**Scope:** S

### T3: Per-mode summaries, streaks, MMR series
**Description:** `src/core/stats.ts`: `myLine`, `isWin`, per-mode session summary (matches, W–L, win %, MMR start→end and Δ,
streak, averages, MVP count), MMR series per mode across all matches with session boundaries, all-time per-mode cards (current, peak, W–L).
**Acceptance:**
- [x] Mixed 2v2 + 3v3 session yields two summaries matching a hand calculation; MMR never mixed across modes
- [x] Streak counts consecutive wins/losses from the latest match within a mode
- [x] Matches with null deltas are skipped in MMR math, not counted as 0
**Verify:** `npx vitest run tests/stats.test.ts`
**Depends on:** T2
**Files:** `src/core/stats.ts`, `tests/stats.test.ts`
**Scope:** S

### T4: Teams, name snapping, duplicates
**Description:** `src/core/teams.ts`: team key, team derivation (all teammates `party` → team; 1v1 none; opponents ignored),
team stats, untrack/re-track; `snapTeammateName` (similarity ≥ 0.85 to known party teammates); `findDuplicate`.
**Acceptance:**
- [x] 2v2 all-party → team; 3v3 with one random → no team; untracked team hidden from list but matches unchanged
- [x] `ZeNoThEoMnIG0D` snaps to existing `ZeNoThEoMnIGoD`; a clearly different name doesn't
- [x] Same mode+names+stats as a saved match → duplicate found
**Verify:** `npx vitest run tests/teams.test.ts`
**Depends on:** T2 (uses `similarity` — copy `names.ts` helpers into `src/core/text.ts` so core doesn't import ocr)
**Files:** `src/core/teams.ts`, `src/core/text.ts`, `tests/teams.test.ts`
**Scope:** S

### Checkpoint A
- [x] Tests + typecheck green; `npm run dev` opens the empty window

---

## Phase 2 — OCR

### T5: Port OCR base + new fixture format
**Description:** Copy `image.ts`, `glyphs.ts`, `layout.ts`, `digit-templates.json`, `scripts/build-templates.mts` and the
reader skeleton; translate comments to English. Define the new `ScoreboardReading` (rows per team with `rawLine`, `name`, `mmr`,
`mmrDelta`, `party`, stats; `mode`, `winner`, `casual`, `me`). Write expected `.json` for the fixtures.
**Acceptance:**
- [x] Header/column layout is found on both fixtures (layout unit test)
- [x] Fixture test harness runs and compares against the new `.json` format (may still fail on fields done in T6–T8)
**Verify:** `npx vitest run tests/ocr-layout.test.ts`
**Depends on:** T1
**Files:** `src/ocr/{image,glyphs,layout,types}.ts`, `scripts/build-templates.mts`, `tests/ocr-layout.test.ts`, `fixtures/*.json`
**Scope:** M

### T6: Name-line parser
**Description:** Pure `parseNameLine(text)` → `{ name, mmr, mmrDelta, tags }`: strips club tags, extracts `[<n> ± <n>]`
with Ø/ø/O→0 inside the bracket, tolerates OCR spacing (`[905+9]`, `[905 + 9 ]`). `isCasual(rows)` = no row has MMR. `findMe(rows, accountName)`.
**Acceptance:**
- [x] All lines from both screenshots parse (`[CLUB] [905 + 9] player_one` → player_one/905/+9; `[XYZ] [895 - 17] rival_four` → −17; `[BACK] wickY26` → no MMR)
- [x] Title lines (`S24 WINS: 215`, `FORK IN THE ROAD`) are not mistaken for MMR
**Verify:** `npx vitest run tests/name-line.test.ts`
**Depends on:** T5
**Files:** `src/ocr/name-line.ts`, `tests/name-line.test.ts`
**Scope:** S

### T7: Row detection + reader output
**Description:** Find 1–3 rows per team without a name list: anchor on SCORE-column digit rows + name-line height; ignore
title lines; per-row contrast normalization so faded rows read. Reader fills the new `ScoreboardReading`; mode = rows per team;
warnings for unequal row counts, missing me, null fields.
**Acceptance:**
- [x] Faded rows (players who left) read correctly — now covered by `2v2-loss-mmr-column-2000`
- [x] `2v2-casual-party-2000` reads names/stats and returns `casual: true`
- [x] Me is found by account name (`wickY26`) regardless of highlight
**Verify:** `npx vitest run tests/ocr-fixtures.test.ts`
**Depends on:** T6
**Files:** `src/ocr/reader.ts`, `src/ocr/layout.ts`, `src/ocr/image.ts`, `tests/ocr-fixtures.test.ts`
**Scope:** M

### T8: Party icon detector
**Description:** Pure detector on a crop between avatar and name (relative to row geometry): green-hue pixel ratio above threshold → `party: true`.
**Acceptance:**
- [x] Casual fixture: ZeNoThEoMnIGoD + proste_cenda party, wickY26 + QuintVB13 not
- [x] Faded-row fixture: nobody party
**Verify:** `npx vitest run tests/party-icon.test.ts tests/ocr-fixtures.test.ts`
**Depends on:** T7
**Files:** `src/ocr/party-icon.ts`, `src/ocr/reader.ts`, `tests/party-icon.test.ts`, `fixtures/*.json`
**Scope:** S

### T9: More fixtures, templates, MMR before/after *(needs your screenshots)*
**Description:** Add your new screenshots (1v1, 3v3, a loss, another resolution, two consecutive same-mode games) with
expected `.json`; regenerate digit templates; add a name-font template set if Tesseract misreads MMR digits.
Confirm whether the bracket MMR is after the match and fix `tracker-core` if not.
**Acceptance:**
- [ ] ≥ 6 fixtures covering 1v1/2v2/3v3, win/loss, faded rows, casual, ≥ 2 resolutions — all pass with zero warnings
- [ ] MMR before/after rule confirmed and written in SPEC.md
**Verify:** `npm test`
**Depends on:** T8 + screenshots from you
**Files:** `fixtures/*`, `src/ocr/digit-templates.json`, `scripts/build-templates.mts`, `SPEC.md`
**Scope:** M

### Checkpoint B — OCR proven
- [ ] All fixtures pass, casual rejected
- [ ] Review OCR results with you before UI work

---

## Phase 3 — Capture loop

### T10: Storage, settings, first-run setup
**Description:** `storage.ts` (atomic write + `.bak`, `schemaVersion: 1`, `%APPDATA%/rl-session-tracker/data/`), `settings.json`
with defaults, IPC + preload API, setup screen (account name required, optional starting MMR per mode, Borderless reminder) shown until account name is set.
**Acceptance:**
- [x] First launch shows setup; after saving, app restarts into the main window and `settings.json` holds the values
- [x] Corrupt `tracker.json` falls back to `.bak` with a visible notice; never silently overwritten
**Verify:** `npx vitest run tests/storage.test.ts` + manual first run
**Depends on:** T2
**Files:** `src/main/storage.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/api.ts`, `src/renderer/src/Setup.tsx`, `tests/storage.test.ts`
**Scope:** M

### T11: F8 → read → confirm card → save
**Description:** Port capture flow: global hotkey, screen grab, reader warm-up, non-focus confirm window (Confirm.tsx adapted:
1–3 rows per team, MMR ± delta, party ✓, me highlighted, warnings). F8 on open card = save, F7 = cancel. Casual → "Casual match —
not saved". Save goes through `sessions.ts` (auto-start/idle), applies name snapping, duplicate warning, saves screenshot JPEG, plays sounds.
**Acceptance:**
- [x] On the real game (Borderless), F8 shows a filled card in ≤ 5 s and F8 again writes the match to `tracker.json`
- [x] Casual screenshot shows the casual message and writes nothing
- [x] Same scoreboard twice → duplicate warning
**Verify:** `npm test` + manual in-game; self-test mode with the fixtures produces card screenshots
**Depends on:** T7, T8, T10, T4
**Files:** `src/main/index.ts`, `src/main/capture.ts`, `src/renderer/src/Confirm.tsx`, `src/shared/api.ts`, `src/renderer/src/sounds.ts`
**Scope:** M

### T12: Card editing + undo
**Description:** Click card → editable (names, MMR, delta, party, stats, winner, mode), Enter = save. `Ctrl+F7` twice within 5 s removes the last saved match.
**Acceptance:**
- [x] A misread value can be corrected and the saved match holds the corrected value
- [x] Undo removes the last match and the session summary updates
**Verify:** manual in dev with self-test images; core recomputation already covered by tests
**Depends on:** T11
**Files:** `src/renderer/src/Confirm.tsx`, `src/main/capture.ts`, `src/main/index.ts`
**Scope:** S

### T13: Session lifecycle in main
**Description:** F9 start/end, 1-minute idle timer calling the T2 rules, tray (show, start/end session, quit), minimize-to-tray, autostart setting applied, state broadcast to windows.
**Acceptance:**
- [x] F9 toggles the session with a sound; tray reflects the state
- [x] With idle set to 1 min in dev, an open session closes by itself at its last match time
**Verify:** manual + `npm test`
**Depends on:** T11
**Files:** `src/main/index.ts`, `src/main/session-timer.ts`, `src/main/tray.ts`
**Scope:** S

### Checkpoint C — Usable in-game
- [ ] Real session: capture, fix, save, undo, end; `tracker.json` matches a hand check
- [ ] Review with you before UI tabs

---

## Phase 4 — Screens

### T14: Session view + tab shell
**Description:** App shell with tabs (Session · Dashboard · Matches · Teams · Settings; empty placeholders). Session view:
one section per mode played, tiles (MMR Δ + start→end, W–L, win %, streak, avg score/goals/assists/saves/shots, MVPs), match list below. No active session → opens Dashboard tab.
**Acceptance:**
- [x] Tiles for a mixed-mode session match `stats.ts` output; list updates live after a save
**Verify:** manual with seeded data (`npm run dev` + sample `tracker.json`)
**Depends on:** T3, T13
**Files:** `src/renderer/src/App.tsx`, `src/renderer/src/views/SessionView.tsx`, `src/renderer/src/components/Tiles.tsx`, `src/renderer/src/components/MatchList.tsx`, `src/renderer/src/styles.css`
**Scope:** M

### T15: Matches tab
**Description:** Full history (newest first, filter by mode), edit via the card editor, delete with confirm; everything recomputes.
**Acceptance:**
- [x] Editing a match's MMR delta changes the session tiles and MMR series
- [x] Delete asks for confirmation and removes only that match
**Verify:** manual + core tests
**Depends on:** T14, T12
**Files:** `src/renderer/src/views/MatchesView.tsx`, `src/main/index.ts`, `src/shared/api.ts`
**Scope:** S

### T16: Dashboard
**Description:** Per-mode cards (current, peak, W–L, win %), MMR line chart per mode (port `LineChart.tsx`; session boundaries; 30 d / 90 d / all), past sessions list → opens that session in Session view.
**Acceptance:**
- [x] Chart points equal `stats.ts` MMR series; modes on separate lines/tabs, never merged
- [x] Clicking a past session shows its per-mode tiles
**Verify:** manual with seeded data
**Depends on:** T14
**Files:** `src/renderer/src/views/Dashboard.tsx`, `src/renderer/src/components/LineChart.tsx`, `src/renderer/src/components/SessionList.tsx`
**Scope:** M

### T17: Teams tab
**Description:** Tracked teams (mode, members, matches, W–L, win %) sorted by matches; detail (my MMR Δ together, my and teammates' averages); Untrack / "Show untracked" / re-track.
**Acceptance:**
- [x] Untrack hides the team and persists across restarts; re-track restores it
**Verify:** manual + `tests/teams.test.ts`
**Depends on:** T14, T4
**Files:** `src/renderer/src/views/TeamsView.tsx`, `src/main/index.ts`, `src/shared/api.ts`
**Scope:** S

### T18: Settings tab
**Description:** Account name, starting MMR per mode, idle minutes, hotkeys (rebind + re-register, show failures), autostart, keep screenshots, open data folder.
**Acceptance:**
- [x] Rebinding F8 to another key works immediately; a key taken by another app shows an error
- [x] Changing idle minutes affects the timer without restart
**Verify:** manual
**Depends on:** T14, T13
**Files:** `src/renderer/src/views/SettingsView.tsx`, `src/main/index.ts`, `src/main/hotkeys.ts`, `src/shared/api.ts`
**Scope:** M

### Checkpoint D — Feature complete (minus overlay/updates)
- [ ] Spec Success Criteria 1–5 met; tests + typecheck green

---

## Phase 5 — Overlay & distribution

### T19: Overlay window
**Description:** Third renderer entry. Transparent, frameless, `alwaysOnTop('screen-saver')`, `setIgnoreMouseEvents(true)`, non-focusable, skip taskbar, primary display.
Shows last-played mode `2v2 · 5W–2L · +41 · W3`, other modes smaller, or "No active session". F10 toggles.
**Acceptance:**
- [x] Visible over Rocket League (Borderless); clicks pass through; never steals focus
- [x] Updates within 1 s of save/undo/edit/session change
**Verify:** manual in-game
**Depends on:** T13, T3
**Files:** `src/main/overlay.ts`, `src/renderer/overlay.html`, `src/renderer/src/Overlay.tsx`, `electron.vite.config.ts`
**Scope:** M

### T20: Overlay settings
**Description:** Settings section: on/off, corner, X/Y offset, opacity 20–100 %, scale; applied live.
**Acceptance:**
- [x] Each setting changes the overlay immediately and persists across restarts
**Verify:** manual
**Depends on:** T19, T18
**Files:** `src/renderer/src/views/SettingsView.tsx`, `src/main/overlay.ts`
**Scope:** S

### T21: Playlist picker + MMR-jump warning
**Description:** Card dropdown for playlist (defaults from row count: Duel/Doubles/Standard; plus Hoops, Rumble, Dropshot, Snow Day); stats and MMR grouped by playlist; warning when my MMR differs > 150 from that playlist's last value.
**Acceptance:**
- [ ] A Hoops match never appears in the 2v2 Doubles MMR line
- [ ] Jump warning appears on a crafted test case
**Verify:** `npx vitest run tests/stats.test.ts` + manual
**Depends on:** T12, T16
**Files:** `src/core/stats.ts`, `src/renderer/src/Confirm.tsx`, `tests/stats.test.ts`
**Scope:** S

### T22: Packaging
**Description:** Icon, `electron-builder.yml` (asar off for tesseract as in noob-league), bundled `eng` data, self-test env vars renamed, README (usage, Borderless, SmartScreen note).
**Acceptance:**
- [x] `npm run dist` builds `RLSessionTracker-Setup-x.y.z.exe`; installed app reads a fixture offline via self-test
**Verify:** `npm run dist` + install + self-test
**Depends on:** Checkpoint D
**Files:** `electron-builder.yml`, `package.json`, `resources/icon.png`, `README.md`, `src/main/index.ts`
**Scope:** S

### T23: Update checks *(needs releases repo)*
**Description:** `electron-updater` with GitHub provider; check on startup + every 6 h; banner "Version x.y.z available — Restart & install"; never auto-restart during an active session; `npm run release`.
**Acceptance:**
- [ ] An installed 0.1.0 detects a published 0.1.1 and installs it only after confirmation
**Verify:** manual with two published test releases
**Depends on:** T22 + repo decision
**Files:** `src/main/updater.ts`, `src/main/index.ts`, `src/renderer/src/components/UpdateBanner.tsx`, `electron-builder.yml`, `package.json`
**Scope:** M

### Checkpoint E — Release ready
- [ ] All spec Success Criteria met; installer + update path verified
