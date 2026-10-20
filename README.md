# RL Session Tracker

Tracks your own Rocket League **competitive** matches (1v1, 2v2, 3v3) from end-of-match scoreboard screenshots:
sessions grouped by mode, MMR over time, premade teams and an in-game overlay. Everything stays on your PC.

Spec: [SPEC.md](SPEC.md) · Intent: [docs/intent/rl-session-tracker.md](docs/intent/rl-session-tracker.md) · Plan: [tasks/plan.md](tasks/plan.md)

Free and open source ([MIT](LICENSE)) · [Code signing policy](#code-signing-policy) · [Privacy](#privacy)

## Install

Download `RLSessionTracker-Setup-x.y.z.exe` from the
**[latest release](https://github.com/wickY26/rl-session-tracker/releases/latest)** and run it (Windows 10/11).

Windows installers are signed through the SignPath Foundation: **free code signing provided by
[SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)** — see the
[code signing policy](#code-signing-policy). Releases marked "unsigned build" (before signing was set up) make
Windows SmartScreen say "Windows protected your PC": click **More info → Run anyway**.

On first start, enter your Rocket League name exactly as it shows on the scoreboard (without club tag).
Your current MMR per mode is optional; the first competitive screenshot fills it in.

## Use

| Hotkey | Does |
|---|---|
| `F8` | Read the screen → confirm card top-right (the game keeps focus). With a card open, `F8` = **save** |
| `F7` | Cancel the card (only taken from the game while a card is open) |
| `F9` | Start / end a session |
| `Ctrl+F7` | Undo the last match (press twice within 5 s) |
| `F10` | Show / hide the overlay |

All hotkeys can be changed in **Settings**.

- Play in **Borderless** window mode — exclusive fullscreen captures come out black, and the overlay can't sit on top.
- The card never takes focus. If something was misread, click the card to fix it, then press Enter.
- **Casual matches** (no MMR on the scoreboard) are recognised and not saved.
- A session starts with `F9` or with the first saved match, and closes by itself after 2 hours without a match (Settings).
- **Teams:** a team appears automatically when every teammate in a match has the green party icon. Teams you don't care
  about can be untracked in the Teams tab; their matches are kept.
- Closing the window keeps the app in the tray (bottom right). Quit from the tray icon → Quit.
- Sounds: beep = captured, two tones = read, three tones = saved, low tone = problem / not saved.

## Data

`%APPDATA%\rl-session-tracker\data\`

- `tracker.json` — sessions and matches (the previous version is kept as `tracker.json.bak` on every save)
- `settings.json`
- `screenshots\` — one JPEG per saved match (can be turned off in Settings)

Nothing is ever cleared automatically. Wrongly read matches can be edited or deleted in the **Matches** tab.

## Development

```
npm install
npm run dev          # run the app in development mode
npm test             # core logic + OCR fixture tests
npm run typecheck
npm run dist         # release/RLSessionTracker-Setup-x.y.z.exe (local build, not published)
npm run release      # build + publish a GitHub release (see below)
```

Other scripts:

```
npm run templates                                  # rebuild digit templates from fixtures/
npx tsx scripts/debug-read.mts <image> <account>   # print what the reader sees in one screenshot
npx tsx scripts/make-sample-data.mts <out.json>    # realistic sample data for checking the screens
npx tsx scripts/make-icon.mts                      # regenerate resources/icon.png
```

### Releasing an update

Installed apps check [the GitHub releases](https://github.com/wickY26/rl-session-tracker/releases) at startup and every
6 hours, show a banner when a newer version exists, and download / restart only when the user clicks. The repo must stay
public for that.

1. Bump `version` in `package.json` (e.g. `0.1.0` → `0.2.0`).
2. Commit and push to `main`.
3. `npm run release` — tags the commit `v<version>` and pushes the tag. GitHub Actions
   ([release.yml](.github/workflows/release.yml)) then type-checks, tests, builds the installer, has it signed by
   SignPath (approve the request in SignPath when it appears) and publishes it with `latest.yml`.

Releases are built on GitHub Actions, never on a developer PC: SignPath only signs verifiable CI builds of this
repository. `npm run release:local` (build and publish from this PC, never signed) is an emergency fallback only.

### Adding a screenshot the reader gets wrong

1. Copy it from `%APPDATA%\rl-session-tracker\data\screenshots\` into `fixtures/`.
2. Add a `.json` next to it with the correct values (see the existing ones: `accountName`, `mode`, `winner`, `casual`,
   `me`, and every player's `name`, `mmr`, `mmrDelta`, `party` and stats).
3. `npm test` shows what's off; `npm run templates` refreshes the digit templates if digits are the problem.

### Self-test (no game needed)

```
RLST_SELFTEST=<img1,img2> RLST_SELFTEST_OUT=<dir> RLST_SELFTEST_ACCOUNT=<name> "RL Session Tracker.exe"
```

Optional: `RLST_SELFTEST_DATA=<tracker.json>` to start from existing data, `RLST_SELFTEST_TABS=Session,Dashboard,…`
to capture tabs. Runs in its own data folder, reads the images through the real card and save path, writes window
screenshots plus `tracker.json` to the output folder, then exits.

## Code signing policy

Windows installers are signed with a certificate from the SignPath Foundation:
**Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).**

- Every signed release is built by [GitHub Actions](.github/workflows/release.yml) from this repository's source;
  nothing built on a personal machine is signed.
- Every signing request is approved manually by an approver.

Team roles:

| Role | Members |
|---|---|
| Committers and reviewers | [wickY26](https://github.com/wickY26) |
| Approvers | [wickY26](https://github.com/wickY26) |

All team members use multi-factor authentication for GitHub and SignPath.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the
user or the person installing or operating it — with one exception, which can be turned off:

- **Update check:** at start-up and every 6 hours the app asks GitHub
  ([releases of this repository](https://github.com/wickY26/rl-session-tracker/releases)) whether a newer version
  exists. The request contains no personal data; as with any web request GitHub sees your IP address
  ([GitHub privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)).
  Turn it off in **Settings → App → Check for updates automatically**. Updates are only downloaded and installed
  when you click to do so. The installer shows this notice before installing.

Everything the app records — matches, sessions and scoreboard screenshots — stays on your PC
(`%APPDATA%
l-session-tracker\data\`). Screenshots are read locally (offline OCR); nothing is uploaded.

## License

[MIT](LICENSE) © 2026 wickY26. Third-party components keep their own licenses: Electron (MIT, Chromium licenses are
shipped with the app), tesseract.js and its English language data (Apache-2.0), jimp (MIT), electron-updater (MIT).
Rocket League is a trademark of Psyonix; this project is not affiliated with or endorsed by Psyonix or Epic Games.
