# Implementation Plan: RL Session Tracker

Spec: [../SPEC.md](../SPEC.md) · Intent: [../docs/intent/rl-session-tracker.md](../docs/intent/rl-session-tracker.md) · Task details: [todo.md](todo.md)

## Overview
A new Electron app built by copying and adapting noob-league's capture + OCR code. It tracks one player's competitive
matches (1v1/2v2/3v3) from scoreboard screenshots: per-mode sessions, a long-term dashboard, premade teams, an in-game
overlay and update checks. The riskiest part (OCR without a known name list: MMR in brackets, 1–3 rows, faded rows,
party icon) is built and proven against real screenshots **before** any UI work.

## Architecture Decisions
- **Copy, don't share.** OCR/capture code is copied from `../noob-league` and adapted; no shared package. The apps evolve separately.
- **Derived state.** Only `sessions`, `matches`, `untrackedTeams` are stored. Summaries, teams, MMR series, streaks are pure
  functions in `src/core` — editing or deleting a match recomputes everything.
- **`playlist` field from day one.** `Match` stores `mode` (row count) and `playlist` (defaults to the standard playlist for that mode),
  so extra ranked modes (Hoops, Rumble…) can be supported later without a data migration.
- **Me = account name, never row highlighting.** Fuzzy match against the configured name.
- **Three renderer entries** (main window, confirm card, overlay) in one Vite renderer build, each a separate `BrowserWindow`.
- **Defaults chosen for open spec questions** (the spec wasn't reviewed in detail; change any of these before the task that uses it):
  1. `905` in `[905 + 9]` = MMR *after* the match → verified in Task 9 with consecutive screenshots.
  2. Extra ranked modes → playlist dropdown on the card + MMR-jump warning (Task 20).
  3. Releases repo → **unknown, blocks Task 22 only.**
  4. Hotkeys → same defaults as noob-league, configurable in Settings (Task 17).
  5. Screenshots → kept forever (setting to turn off saving).

## Dependency graph
```
T1 scaffold
 ├── T2 core types+sessions ── T3 summaries ── T4 teams
 └── T5 OCR port ── T6 name-line parser ── T7 rows/reader ── T8 party icon ── T9 more fixtures*
                                                    │
T2..T8 ──────────────────────────────── T10 storage+setup ── T11 capture→card→save ── T12 card editing+undo ── T13 session lifecycle
                                                                                                            │
                                   T14 session view (tab shell) ── T15 matches ┬ T16 dashboard ┬ T17 teams ┬ T18 settings
                                                                                │
                                              T19 overlay ── T20 overlay settings ;  T21 playlist picker ;  T22 packaging ── T23 updater*
```
`*` = needs input from you (screenshots / releases repo).

## Task List

### Phase 1 — Foundation (pure logic, no UI)
- [x] T1: Scaffold the project (configs, empty window, test runner)
- [x] T2: Core types + session open/close/idle rules
- [x] T3: Per-mode session summaries, streaks, MMR series
- [x] T4: Teams (all-party rule, untrack), name snapping, duplicate detection

### Checkpoint A — Foundation
- [x] `npm test` + `npm run typecheck` green; `npm run dev` opens an empty window

### Phase 2 — OCR (highest risk, fail fast)
- [x] T5: Port OCR base from noob-league + fixture format for the new reading
- [x] T6: Name-line parser (club tags, `[905 + 9]`, Ø→0, casual detection)
- [x] T7: Row detection without known names (1–3 rows, faded rows, titles ignored) + new reader output
- [x] T8: Party icon detector
- [ ] T9: More fixtures (1v1, 3v3, loss, other resolution) + regenerate templates + verify MMR before/after *(needs your screenshots)*

### Checkpoint B — OCR proven
- [ ] Every fixture reads with zero warnings; casual fixture is rejected
- [ ] **Review with you:** OCR results on your real screenshots before building UI

### Phase 3 — Capture loop (first end-to-end slice)
- [x] T10: Storage, settings and first-run setup screen
- [x] T11: F8 → read → confirm card → save into a session
- [x] T12: Confirm-card editing + undo last match
- [x] T13: Session lifecycle in main (F9, auto-start, 2 h idle timer, tray)

### Checkpoint C — Usable in-game
- [ ] Play a real session: capture, fix, save, undo, end; `tracker.json` is correct by hand check
- [ ] **Review with you** before UI tabs

### Phase 4 — Screens
- [x] T14: Session view (tab shell, per-mode tiles, match list)
- [x] T15: Matches tab (history, edit, delete)
- [x] T16: Dashboard (per-mode cards, MMR chart, past sessions)
- [x] T17: Teams tab (list, detail, untrack/show)
- [x] T18: Settings tab (account, starting MMR, idle, hotkeys, autostart, screenshots)

### Checkpoint D — Feature complete (minus overlay/updates)
- [ ] All spec Success Criteria except overlay/updater met; tests green

### Phase 5 — Overlay & distribution
- [x] T19: Overlay window (click-through, live summary, F10)
- [x] T20: Overlay settings (position, opacity, scale, on/off)
- [ ] T21: Playlist picker + MMR-jump warning
- [x] T22: Packaging (icon, installer, self-test, offline OCR)
- [ ] T23: Update checks via GitHub Releases *(needs releases repo)* — code done; end-to-end check needs two published releases

### Checkpoint E — Release ready
- [ ] Installer installs, OCR works offline, overlay works over the game, an older build updates to a newer release

## Parallelization
- T2–T4 (core) and T5–T8 (OCR) are independent after T1 → can run in parallel sessions.
- T15–T18 are independent once T14 has created the tab shell (each owns its own component file; only `App.tsx` nav is shared — T14 adds all tab slots up front).
- T19–T21 independent of each other; T22 → T23 sequential.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Rows can't be found without a known-name list (titles, tags, faded rows confuse line detection) | High | T7 anchors rows on the SCORE column digits + line height, not on names; fixture-driven; done before any UI |
| MMR digits (thin name font, slashed Ø) misread by Tesseract | High | Ø/O→0 normalization; if not enough, a second glyph-template set for the name font (T9) |
| Too few fixtures (only one competitive screenshot today) | High | Checkpoint B blocks on your screenshots: 1v1, 3v3, a loss, another resolution |
| Party icon colour/position varies by platform icon or resolution | Med | Relative crop from row geometry; green-hue ratio threshold tested on all fixtures |
| Extra ranked modes pollute 2v2/3v3 MMR graphs | Med | `playlist` field from day one; T21 adds picker + jump warning |
| Hotkey clash with noob-league running at the same time | Med | Configurable hotkeys (T18); registration failure shown in UI (as in noob-league) |
| Unsigned installer → SmartScreen; updater needs a public repo | Med | Documented in README; T23 blocked until repo chosen |
| Overlay hidden by exclusive fullscreen | Low | Borderless already required; setup screen reminds |
| First fixture is `.webp` (jimp can't read it) | Low | Convert to PNG in T5 |

## Open Questions (for you, before the task that needs them)
- T9: Please collect screenshots — a 1v1, a 3v3, a loss, and two in a row from the same mode (for MMR before/after).
- T23: Which GitHub account/repo will host releases (must be public)?
- T21: OK to treat Hoops/Rumble/Dropshot/Snow Day via a playlist dropdown on the card?
