# RL Session Tracker — Confirmed Intent

_Date: 2026-10-19 · Confirmed in an interview session (interview-me)_

## Outcome
A standalone Windows desktop app (built on noob-league's capture + OCR foundation) that tracks **your own** Rocket League
competitive matches across **1v1, 2v2 and 3v3**. History is kept forever, so performance and MMR can be followed per session and over time.

## Users
Anyone who installs it. Each install is local and bound to **one account name** entered at setup
(starting MMR per mode is optional — the first competitive screenshot fills it). No hardcoded player names.
An installer will be published; the app checks for updates.

## Why
noob-league solved "screenshot → stats" for a fixed 4-person 2v2 league. This is the same flow for an individual's
competitive play: MMR, all modes, changing teammates, no season resets.

## Capture & reading
- Same flow as noob-league: hotkey on the end-of-match scoreboard → confirm card (no focus steal) → save.
- MMR is shown for **every** player in a column left of the row: `+9 1273` → change + MMR after the match
  (correction 2026-10-19: the `[905 + 9] name` format came from an older screenshot; it is still read as a fallback).
- **No MMR on the screenshot → casual match → not saved** (card says so).
- **Me** = the row matching the configured account name. Row highlighting means nothing (bright = still in lobby, faded = left the match).
- Faded rows (players who left) must be read correctly.
- Mode = number of rows per team (1/2/3).
- Green **party icon** next to a name = premade. Player titles under names (`FORK IN THE ROAD`, `S24 WINS: 215`) are ignored.
- Multiple resolutions (seen: 1920×1080, 2000×1125).

## Sessions
- Starts with a **Start session** button/hotkey, or automatically with the first saved match.
- Ends with **End session** button/hotkey, or auto-closes after ~2 h without a saved match (configurable).
- A session can mix modes; everything inside it is **grouped by mode** (MMR is never summed across modes).

## Teams
- A team is auto-created when **all** of my teammates in a match have the party icon (e.g. 3v3 with one random → no team).
- Opponents' parties are ignored.
- Teams tab: per-team **untrack / re-track** (hides it, never deletes matches).
- Team view: games, W–L, win rate, MMR change together, average stats.

## Screens
- **Main screen with an active session:** summary tiles at top (MMR change, W–L, averages: score, goals, assists, saves, shots…) per mode, then the session's match history.
- **Without an active session:** dashboard — MMR graph per mode over time, past sessions, teams.
- **Overlay:** always on top of the game, click-through, shows current session W–L, MMR change, streak. Settings: position, transparency, size, on/off.

## Constraints
- Windows, Borderless game mode, offline OCR, no external APIs / BakkesMod.
- Local data only; never cleared automatically.
- UI language: English.

## Out of scope (v1)
Public website/publishing, shared/cloud data between users, casual matches, opponent team tracking,
seasons/data resets, exclusive fullscreen, deeper analytics views (time-of-day, MMR vs lobby average — data is stored, views later).
