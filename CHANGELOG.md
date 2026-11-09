# Changelog

## 0.8.0 — Player compatibility

- Improved video discovery across dynamically created and nested shadow roots and replacement players.
- Overlay positioning follows video and ancestor layout changes, with improved stacking around page controls.
- Added a typed registry and separate site overlay policy modules, keeping placement and lifecycle behavior shared.
- Added opt-in local compatibility recording through `recon:dev` for operator-guided investigation.

## 0.7.0 — Looping and fullscreen

- Added an optional extras bar with A/B markers, jumps to either marker, and marked-span or whole-video looping.
- Added a per-video fullscreen button and optional shortcuts for looping, fullscreen, and opening settings.
- Media shortcuts prioritize the fullscreen video. Native video fullscreen hides the extension overlay, while fullscreen player wrappers retain it, including wrappers with shadow roots.
- Improved handling of videos moved between documents.
- Improved auto-hide behavior for loop hotkeys and prevented deleted site settings from being restored by pending edits.

## 0.6.0 — Volume controls and interface updates

- Added an optional volume bar with percentage ticks, a slider, and mute/unmute.
- Added per-video mute and volume shortcuts, with optional hold-to-repeat for volume steps.
- Added shortcuts to seek to 10%–90% of the seekable range and a choice to block or pass through matched shortcuts to the page.
- Replaced the remaining React UI runtime with vanilla TypeScript and DOM components for the popup and settings page.
- Improved focus, hit targets, active settings panes, and control state during updates, with clearer loading, permission, and save feedback.
- Seek and volume controls clean up drags when hidden or removed, and their readouts keep a stable layout.

## 0.5.0 — Playback preferences and seeking

- Separated current and default playback speeds, with an option to use the last used speed for new tabs and reloads.
- Reset now restores the default speed; added a separate shortcut to reset to 1×.
- Added independent increase/decrease speed steps and separate size settings for the overlay and action feedback.
- Added an optional seek bar showing current time, duration, playback progress, and buffered ranges.
- Seek scrubbing ends when the pointer is released outside the range, and default-speed updates preserve the current speed on open tabs.

## 0.4.0 — Navigation and action feedback

- Added an optional navigation bar with play/pause, start/end jumps, configurable skips, and hold-to-fast-forward. Skip distances can scale with playback speed.
- Added hold-to-rewind. Temporary playback holds restore the previous speed on release and end when the tab or window loses visibility.
- Added optional hold-to-repeat for speed and skip shortcuts, with adjustable delay and repeat rate.
- Added on-video feedback for overlay actions and hotkeys, with configurable opacity and duration. Held actions keep their feedback visible until release.
- Added a fixed 1× speed policy and site-list sorting by name or recent activity.
- Controls and shortcuts become available on already-loaded videos as soon as site access is granted, including newly granted frames.
- Applied the saved theme before first paint and improved settings layout, validation, auto-hide, and focus behavior.
- Expanded unit and browser coverage, release checks, bundle-size comparisons, and third-party notice generation; updated dependencies and tooling.

## 0.3.0 — Backups, shortcuts, and broader access

- Added JSON settings backup export and import, with merge/replace choices and validation before applying changes.
- Added optional enable-on-all-sites access from Settings.
- Added configurable speed shortcuts with global defaults, per-site overrides, shortcut recording, conflict warnings, and overlay hints.
- Added overlay opacity and site-settings deletion controls.
- Improved settings saves, per-tab speed changes, and Chrome Sync recovery during concurrent updates and failures. Settings from newer versions are preserved and protected from incompatible writes.
- Added clearer validation and import/export error feedback, with stronger validation of extension messages, sender permissions, and site access changes.
- Rebuilt the overlay with vanilla DOM components and shared layout measurements.

## 0.2.0 — On-video controls and settings

- Added a per-video overlay with a speed readout, faster/slower controls, reset, a position picker, and a settings button.
- Added overlay visibility, nine positions, auto-hide delay, and hover hold.
- Added a settings page for global defaults and per-site overrides, with reset controls and configurable minimum/maximum speeds and speed steps.
- Added light, dark, and system themes across the popup and settings page.
- Improved playback-speed restoration when control ends and synchronization between the popup, settings, and active videos.

## 0.1.0 — Initial toolbar controls

- Initial development version of Open Source Video Speed Controller
- Toolbar popup with ticks, reset, slider, and per-site enable
- Optional host permissions, dynamic content-script registration, and live teardown
