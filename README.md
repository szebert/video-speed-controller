# Open Source Video Speed Controller

Open source Chrome extension for controlling HTML5 video playback speed.

OS Video Speed Controller (OS VSC) is a toolbar popup and per-video overlay that sets HTML5 `<video>` playback speed on sites you explicitly enable. There are no accounts, analytics, or servers.

## Features

- Enable one site at a time from the popup, or all sites from Settings, through Chrome’s optional host permission prompt
- Toolbar popup: Faster / Slower, reset to 1×, and a slider (commits when you release it)
- Per-site default speed, plus a per-tab effective speed so changing defaults does not jump an already-playing tab
- Configurable speed range and step (0.0625×–16×, step 0.0005×–1×)
- Configurable page hotkeys for Faster / Slower / reset (defaults `[`, `]`, `\`), with Global → Site inheritance and conflict-aware capture
- Optional hotkey flash on videos (default on): new speed, signed change, and the shortcut used, then auto-hide; own opacity and delay
- Per-video overlay: speed, Faster / Slower, optional position picker and settings button
- Overlay position (3×3 grid), opacity, show/hide, auto-hide, hover-hold, delay, and shortcut hints
- Options page with Global defaults and per-site overrides; reset defaults, delete a site, or reset all
- Light, dark, and system theme
- Same-origin frames and granted iframes; ungranted embeds stay untouched

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned and exploratory features.

## Install (development)

Requirements: Node.js 22+ and pnpm 12.3.4.

```bash
pnpm install
pnpm dev
```

Then in Chrome open `chrome://extensions`, enable Developer mode, and **Load unpacked** from:

```text
.output/chrome-mv3-dev
```

Enable OS VSC on a site from the popup. Streamer sites without a native speed control (for example Max) are **verified behavior** after you sign in — they are not Store SEO copy. Netflix, YouTube, and similar players should be checked the same way: enable the site, then confirm existing videos change without a reload.

Enable on an already-loaded page injects the engine immediately so overlay and page hotkeys work without a popup speed change. A Chrome Site access grant on an open tab does the same for matching pages.

## Scripts

| Command              | Purpose                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`           | WXT development build                                                              |
| `pnpm build`         | Production Chrome build                                                            |
| `pnpm test`          | Unit tests                                                                         |
| `pnpm lint`          | ESLint                                                                             |
| `pnpm format`        | Prettier write                                                                     |
| `pnpm format:check`  | Prettier check                                                                     |
| `pnpm e2e`           | Playwright: fixture pages plus a loaded-extension popup (Enable, speed, chrome://) |
| `pnpm zip`           | Pack `opensource-video-speed-controller-<version>-chrome.zip`                      |
| `pnpm check:release` | License, lockfile, and manifest invariants                                         |

## License

Licensed under the GNU General Public License v3.0 only (`GPL-3.0-only`). See [LICENSE](LICENSE).

GPLv3 allows commercial use. Distributed derivative works must comply with GPLv3 and provide corresponding source under GPLv3.
