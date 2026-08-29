# Privacy

Open Source Video Speed Controller does not collect personal information, create accounts, or send extension traffic to the developer or any other server.

## What stays on your devices

- **Per-site playback speed intent** may be stored in `chrome.storage.sync` as `site:<hostname>` → `{ schemaVersion, speed }`. If Chrome Sync is enabled, that hostname and speed preference can follow your Google account to your other Chrome profiles. It is never sent to the developer.
- **Per-tab effective speed** is kept in session storage on this browser only.
- **Site access** is Chrome’s host-permission state. The extension does not keep a separate enabled-sites list.

## Permissions

- `activeTab` identifies the current page when you open the toolbar popup. Opening the popup does not inject scripts or request lasting host access.
- `storage` reads and writes the per-site speed preference.
- `scripting` injects the playback engine after you grant a site.
- Optional `http://*/*` and `https://*/*` hosts are requested one origin at a time from the popup click.

## What we do not do

- No analytics, telemetry, advertising, or remote configuration
- No remote code
- No accounts
- No extension-originated network requests

Source: [https://github.com/szebert/video-speed-controller](https://github.com/szebert/video-speed-controller), licensed under GPL-3.0-only.
