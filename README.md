# Open Source Video Speed Controller

Open source Chrome extension for controlling HTML5 video playback speed.

OS Video Speed Controller (OS VSC) is a toolbar popup that sets HTML5 `<video>` playback speed on sites you explicitly enable. There are no accounts, analytics, or servers.

## Features

- Per-site synced speed intent (`siteSpeed`) and a per-tab effective speed (`tabTarget`)
- Enable one site at a time through Chrome’s optional host permission prompt
- Tick buttons, reset, and a slider (the slider commits when you release it)
- Works in same-origin frames and granted iframes; ungranted embeds stay untouched

## Install (development)

Requirements: Node.js 22+ and pnpm 11.24.0.

```bash
pnpm install
pnpm dev
```

Then in Chrome open `chrome://extensions`, enable Developer mode, and **Load unpacked** from:

```text
.output/chrome-mv3-dev
```

Enable OS VSC on a site from the popup. Streamer sites without a native speed control (for example Max) are **verified behavior** after you sign in — they are not Store SEO copy. Netflix, YouTube, and similar players should be checked the same way: enable the site, then confirm existing videos change without a reload.

A Chrome Site access grant on an already-loaded page updates registration only. The engine starts on reload/navigation, or immediately when you use a popup speed control.

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
