# Chrome Web Store

Formal name: **Open Source Video Speed Controller**  
Short name: **OS VSC**  
Repository: [szebert/video-speed-controller](https://github.com/szebert/video-speed-controller)  
License: GNU GPL v3.0 only (`GPL-3.0-only`)

## Listing copy

Short:

> Control HTML5 video playback speed from the Chrome toolbar. Open source. No accounts, analytics, or servers.

Longer:

Open Source Video Speed Controller (OS VSC) lets you speed up or slow down HTML5 video from the Chrome toolbar. Access is off by default. You enable one site at a time. Per-site speed intent may follow Chrome Sync. The source is on GitHub under GPLv3. There are no accounts, analytics, or servers.

Do not use bare “Video Speed Controller” as the listing name.

## Permission justifications

- **storage** — Save the user’s per-site playback-speed preference.
- **activeTab** — Read the current tab URL when the user opens the popup so the popup can show that site’s state. Opening the popup does not inject or persist host access.
- **scripting** — Inject the isolated-world playback engine into a tab after the user grants that site.
- **optional host permissions (`http://*/*`, `https://*/*`)** — Requested one origin at a time from the popup. Not granted at install.

## Privacy practices

See [PRIVACY.md](PRIVACY.md). Hostname + speed intent may sync via Chrome Sync and are never sent to the developer. Single purpose: control HTML5 video playback speed.

## Release

First listing is **manual**. Later automation may use Chrome Web Store API v2 with `STAGED_PUBLISH`.

Every distributed ZIP is built from a version tag. The GitHub Release for `vX.Y.Z` must include:

- `opensource-video-speed-controller-X.Y.Z-chrome.zip`
- corresponding source for that same tag/commit
- CI commit SHA
- SHA-256 of the ZIP

Do not publish a binary whose source is a different commit.

## Topics

`chrome-extension` `video` `playback-speed` `manifest-v3` `wxt` `typescript` `react`
