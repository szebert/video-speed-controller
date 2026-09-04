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

- Play / pause
- Seek backward / forward
- Configurable seek interval, defaulting to 5 seconds
- Global → Site settings for control visibility and seek interval
- Keyboard and screen-reader accessible controls

### Keyboard shortcuts

Add configurable shortcuts for speed and media controls.

- Global → Site inheritance
- Clear display of active bindings
- Conflict-aware shortcut capture
- Accessible keyboard-only configuration

### Overlay customization

Expand overlay settings as the control surface grows.

- Show or hide control groups
- Overlay opacity
- Layout behavior for multi-row controls

## Planned enhancements

These features fit the controller direction but are not part of the first
media-controls milestone.

- Seek bar with current time and duration
- Volume, mute, and volume slider
- Fullscreen and Picture-in-Picture controls
- Caption toggle and track selection when supported by the video
- Loop and A-B loop controls
- Jump to beginning / end
- Optional video information panel

## Exploring

Ideas that need more product and compatibility work before committing to an
implementation:

- Hold-to-rewind / hold-to-fast-forward interactions
- Rich buffered-range visualization
- More advanced overlay layout and grouping

## Release readiness

Before a public Chrome Web Store release:

- Finalize store listing and screenshots
- Complete manual compatibility testing on major video sites
- Document privacy and permission behavior clearly
- Add release packaging and publishing automation
