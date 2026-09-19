# Open Source Video Speed Controller

Open source Chrome extension for controlling HTML5 `<video>` playback.

OS Video Speed Controller (OS VSC) is a toolbar popup and a per-video overlay. You grant sites yourself through Chrome’s optional host permissions. There are no accounts, analytics, or servers.

## Features

**Access**

- Enable one site from the popup, or all sites from Settings
- Works on an already-loaded page after you grant access — no reload, no extra speed change required
- Same-origin frames and granted iframes; ungranted embeds stay untouched

**Popup**

- Faster / slower, reset, and a slider
- Per-site speed preference, plus a per-tab effective speed so changing defaults does not jump a video that is already playing
- Light, dark, and system theme

**Overlay**

- Per-video speed readout, faster / slower, position picker, and settings button
- Move it, hide it, change opacity, auto-hide, and show shortcut hints
- Optional navigation bar: jump to start or end, play / pause, skip back or forward, hold-to-fast-forward, and hold-to-rewind
- Configurable skip distances, with optional scaling by the current playback rate
- Fast forward holds a temporary rate and restores the previous one on release
- Rewind seeks backward while held. Chrome cannot play video in reverse, so there is no reverse audio

**Hotkeys**

- Page shortcuts for speed and every navigation action
- Global defaults with per-site overrides
- Optional hold-to-repeat for step and skip keys. Fast forward and rewind always hold
- Optional flash when a control or hotkey is used; held actions stay visible until release

**Settings**

- Options page for playback, overlay, navigation, and hotkeys
- Global defaults and per-site overrides; reset a site or reset all
- Configurable speed range and step
- Export or import a JSON backup

## Privacy

See [PRIVACY.md](PRIVACY.md). The extension does not collect page data or send extension traffic to a server. Per-site speed intent may follow Chrome Sync if you have it enabled.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned work. Store listing notes are in [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md).

## Install (development)

Requirements: Node.js 22+ and pnpm 12.4.1.

```bash
pnpm install
pnpm dev
```

Then in Chrome open `chrome://extensions`, enable Developer mode, and **Load unpacked** from:

```text
.output/chrome-mv3-dev
```

Enable a site from the popup. After granting access, existing videos should respond without a reload.

## Scripts

| Command              | Purpose                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`           | WXT development build                                                          |
| `pnpm build`         | Production Chrome build                                                        |
| `pnpm compile`       | Typecheck                                                                      |
| `pnpm test`          | Unit tests                                                                     |
| `pnpm lint`          | ESLint                                                                         |
| `pnpm format`        | Prettier write                                                                 |
| `pnpm format:check`  | Prettier check                                                                 |
| `pnpm e2e`           | Playwright: fixtures plus loaded-extension popup, options, overlay, and rewind |
| `pnpm e2e:extension` | Playwright extension project only                                              |
| `pnpm zip`           | Pack `opensource-video-speed-controller-<version>-chrome.zip`                  |
| `pnpm check:release` | License, lockfile, manifest, and bundle growth vs the last GitHub release zip  |
| `pnpm notices`       | Generate `THIRD_PARTY_NOTICES`                                                 |
| `pnpm icons`         | Rasterize toolbar/store PNGs from `src/assets/logo.svg`                        |

## License

Licensed under the GNU General Public License v3.0 only (`GPL-3.0-only`). See [LICENSE](LICENSE).

GPLv3 allows commercial use. Distributed derivative works must comply with GPLv3 and provide corresponding source under GPLv3.
