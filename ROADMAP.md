# Roadmap

OS Video Speed Controller is evolving from a speed controller into a
configurable per-video control overlay for HTML5 video.

This roadmap describes product direction, not a release schedule. Priorities
may change as features are tested. Current functionality is documented in the
README; this file focuses on planned work. Concrete implementation work is
tracked in GitHub Issues.

## Near term

### Media controls row

Add an optional second row of per-video controls to the overlay.

Initial scope:

- Jump to start / end
- Play / pause
- Skip backward / forward, with independent distances defaulting to 5s and 10s
- Optional scaling of skip distance by the current playback speed
- Hold-to-fast-forward at a configurable temporary speed, defaulting to 3×
- Rewind as visible-but-disabled scaffolding, with a stored −1× speed
- Assignable hotkeys with overlay hint chips, unbound by default
- Global → Site settings for row visibility, skip distances, and transport speeds
- Keyboard and screen-reader accessible controls

### Overlay customization

Expand overlay settings as the control surface grows.

- Show or hide control groups
- Layout behavior for multi-row controls

## Planned enhancements

These features fit the controller direction but are not part of the first
media-controls milestone.

- Seek bar with current time and duration
- Volume, mute, and volume slider
- Fullscreen and Picture-in-Picture controls
- Caption toggle and track selection when supported by the video
- Loop and A-B loop controls
- Optional video information panel

## Exploring

Ideas that need more product and compatibility work before committing to an
implementation:

- Smooth reverse playback for hold-to-rewind
- Rich buffered-range visualization
- More advanced overlay layout and grouping

## Release readiness

Before a public Chrome Web Store release:

- Finalize store listing and screenshots
- Complete manual compatibility testing on major video sites
- Document privacy and permission behavior clearly
- Add release packaging and publishing automation
