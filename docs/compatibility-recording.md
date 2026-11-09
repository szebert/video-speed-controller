# Interactive compatibility recording

Run `pnpm recon:dev` (or `pnpm.cmd recon:dev` in PowerShell). Keep it running.
This starts WXT development mode and a receiver bound to `127.0.0.1:4174`.
It does not open or control Chrome.

1. In your normal Chrome session, open `chrome://extensions` and turn on Developer mode.
2. Reload your existing unpacked development extension, or **Load unpacked** from
   `C:\Users\rszeb\CodeProjects\video-speed-controller\.output\chrome-mv3-dev`.
   Its name should be **OSVSC Recon (local diagnostics)**. Disable any other OSVSC
   installation during the test so only one copy controls the player.
3. Open a YouTube watch page that actually plays for you. Open the extension's
   **toolbar popup**, enable the site if needed, and accept Chrome's permission prompt.
4. Click **Record checkpoint**. Wait for **Checkpoint saved ✓** and tell the agent
   that YouTube is ready. If recording fails, report the message on the button.

The agent reads the log path in `test-results/recon/latest.json` and the append-only
NDJSON log directly from this workspace. No upload or DevTools console copy is needed.
`http://127.0.0.1:4174/status` also shows whether the receiver is getting events.

Work through one requested action at a time: playback, speed/reset, scroll or player
size changes, native controls, fullscreen enter/exit, then navigation to another video.
Record a checkpoint after each requested action and report what you saw.
Repeat with Twitch. Max remains conditional on your own entitled session.

The logger records the popup target hostname/tab, permission request gesture and
true/false/rejected result, granted origin patterns, the exact-port permission check,
`ENABLE_SITE` response, media progress/rate/ownership, video and overlay bounds and
identities, fullscreen placement, and click hit targets. It records no cookies, page
text, media source URLs, input values, or keyboard input. Permission patterns do reveal
the extension's granted hosts. Visual priority and intended pointer priority require
your observation; a hit test alone does not establish a compatibility failure.

Manual checkpoints also record up to 16 ancestors for each of four on-screen videos,
including shadow/slot boundaries, bounds, and stacking-related computed styles.
Clicks outside OSVSC record the same structural details for their target. These help
identify player mounts and header stacking without copying page text or URLs.

Snapshots follow events; media progress is sampled at most once every five seconds
per video. A 250 ms timer coalesces bursts and stops when idle. There is no polling
loop. This instrumentation adds observers and DOM measurements, so use a regular
build for performance benchmarks. Each recording session has a separate ignored log,
bounded to 25 MiB. Events are saved before a checkpoint reports success. If the
receiver stops, checkpoints report a failure; automatic events are not buffered.

During a receiver outage, automatic writes share an event-driven retry backoff
from one to 30 seconds across all tabs and frames. The background console reports
the outage and recovery once at debug level, without adding extension warnings.
Events during the backoff are dropped. **Record checkpoint** always tries
immediately and still reports failure if it cannot save.

Restarting `recon:dev` creates a new log and session token. Once WXT is ready,
reload the unpacked extension and the test pages, then record a checkpoint to
confirm the new session is receiving events. Old Chrome error entries remain
until you clear them. A regular `pnpm dev` session has no recorder.

Stop with Ctrl+C. Running regular `pnpm dev` and reloading the extension removes
recording and its popup button. Production builds always exclude the logger and its
localhost permission, even if `OSVSC_RECON=1` is set. Recording does not update the
compatibility catalog or implement site policies.
