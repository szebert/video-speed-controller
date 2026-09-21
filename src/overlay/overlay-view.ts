// SPDX-License-Identifier: GPL-3.0-only

import { speedPolicyFromApplied } from '../core/applied-tab-behavior';
import type { MediaNavigationAction, TransportHoldOwner } from '../core/controller-action';
import { ariaKeyshortcutsFromBinding, visualHotkeyParts } from '../core/hotkey-format';
import { canAdjustSpeed, canonicalizeSpeed, formatSpeed } from '../core/speed';
import {
  bufferedStructureKey,
  clampDisplayedCurrentTime,
  formatMediaTime,
  formatTimelineReadout,
} from '../core/media-time';
import { t, type MessageKey } from '../i18n/t';
import type { HotkeyBinding } from '../settings/hotkey-binding';
import {
  canonicalizeOverlayOpacity,
  HOLD_ACTIONS,
  overlayPositionToGrid,
  type OverlayPosition,
} from '../settings/site-behavior';
import type { OverlayTimelineState, OverlayViewCallbacks, OverlayViewState } from './types';

const POSITION_LABELS = [
  'positionTopLeft',
  'positionTopCenter',
  'positionTopRight',
  'positionCenterLeft',
  'positionCenter',
  'positionCenterRight',
  'positionBottomLeft',
  'positionBottomCenter',
  'positionBottomRight',
] as const satisfies readonly MessageKey[];

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Required left-to-right order of the navigation row. */
const NAVIGATION_BUTTONS = [
  { action: 'jumpToStart', label: 'navJumpToStart' },
  { action: 'rewind', label: 'navRewind' },
  { action: 'skipBack', label: 'navSkipBack' },
  { action: 'playPause', label: 'navPlay' },
  { action: 'skipForward', label: 'navSkipForward' },
  { action: 'fastForward', label: 'navFastForward' },
  { action: 'jumpToEnd', label: 'navJumpToEnd' },
] as const satisfies readonly { action: MediaNavigationAction; label: MessageKey }[];

export class OverlayView {
  readonly element: HTMLDivElement;
  readonly speedReadout: HTMLButtonElement;

  private readonly document: Document;
  private readonly abort = new AbortController();
  private readonly bar: HTMLDivElement;
  private readonly move: HTMLButtonElement;
  private readonly slower: HTMLButtonElement;
  private readonly speedValue: HTMLSpanElement;
  private readonly faster: HTMLButtonElement;
  private readonly settings: HTMLButtonElement;
  private navigationBar: HTMLDivElement | null = null;
  private navigationButtons: Map<MediaNavigationAction, HTMLButtonElement> | null = null;
  private seekBar: HTMLDivElement | null = null;
  private seekRange: HTMLInputElement | null = null;
  private seekPlayed: HTMLDivElement | null = null;
  private seekBufferedHost: HTMLDivElement | null = null;
  private seekReadout: HTMLSpanElement | null = null;
  private bufferCacheKey = '';
  private scrubbing = false;
  private pointerSeeking = false;
  private pointerCommitted = false;
  private readonly activeHolds = new Set<() => void>();
  private picker: HTMLDivElement | null = null;
  private pickerOpen = false;
  private pointerWithin = false;
  private focusWithin = false;
  private lastInteractive: boolean | null = null;
  private state: OverlayViewState | null = null;

  get isScrubbing(): boolean {
    return this.scrubbing;
  }

  constructor(
    document: Document,
    private readonly callbacks: OverlayViewCallbacks,
  ) {
    this.document = document;
    this.element = document.createElement('div');
    this.element.className = 'controls-shell';

    this.bar = document.createElement('div');
    this.bar.className = 'controls';
    this.bar.setAttribute('role', 'group');

    this.move = this.createChromeButton('control control-icon', t('overlayMove'));
    this.move.setAttribute('aria-haspopup', 'true');
    this.move.setAttribute('aria-expanded', 'false');
    this.move.append(createMoveIcon(document));
    this.move.addEventListener(
      'click',
      (event) => {
        this.togglePicker();
        blurAfterPointerClick(event);
      },
      { signal: this.abort.signal },
    );

    this.slower = this.createChromeButton('control control-adjust', t('slower'));
    this.slower.append(createAdjustIcon(document, -1));
    this.slower.addEventListener(
      'click',
      (event) => {
        if (!this.slower.disabled) {
          this.callbacks.onAdjust(-1);
        }
        blurAfterPointerClick(event);
      },
      { signal: this.abort.signal },
    );

    this.speedReadout = this.createChromeButton(
      'control control-speed speed',
      t('hotkeyResetSpeed'),
    );
    this.speedValue = document.createElement('span');
    this.speedValue.className = 'speed-value';
    this.speedReadout.append(this.speedValue);
    this.speedReadout.addEventListener(
      'click',
      (event) => {
        if (!this.speedReadout.disabled) {
          this.callbacks.onReset();
        }
        blurAfterPointerClick(event);
      },
      { signal: this.abort.signal },
    );

    this.faster = this.createChromeButton('control control-adjust', t('faster'));
    this.faster.append(createAdjustIcon(document, 1));
    this.faster.addEventListener(
      'click',
      (event) => {
        if (!this.faster.disabled) {
          this.callbacks.onAdjust(1);
        }
        blurAfterPointerClick(event);
      },
      { signal: this.abort.signal },
    );

    this.settings = this.createChromeButton('control control-icon', t('openSettings'));
    this.settings.append(createSettingsIcon(document));
    this.settings.addEventListener(
      'click',
      (event) => {
        this.setPickerOpen(false);
        this.callbacks.onOpenSettings();
        blurAfterPointerClick(event);
      },
      { signal: this.abort.signal },
    );

    this.bar.append(this.slower, this.speedReadout, this.faster);
    this.element.append(this.bar);

    const signal = this.abort.signal;
    this.element.addEventListener(
      'pointerenter',
      () => {
        this.pointerWithin = true;
        this.notifyInteractive();
      },
      { signal },
    );
    this.element.addEventListener(
      'pointerleave',
      () => {
        this.pointerWithin = false;
        this.notifyInteractive();
      },
      { signal },
    );
    this.element.addEventListener(
      'focusin',
      () => {
        this.focusWithin = true;
        this.notifyInteractive();
      },
      { signal },
    );
    this.element.addEventListener(
      'focusout',
      (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && this.element.contains(next)) {
          return;
        }
        this.focusWithin = false;
        this.notifyInteractive();
      },
      { signal },
    );
  }

  update(state: OverlayViewState): void {
    this.state = state;
    if (!state.visible) {
      // A hold cannot outlive the controls that started it.
      this.releaseHolds();
      this.pointerWithin = false;
      this.focusWithin = false;
      this.clearSeekGesture();
      this.setPickerOpen(false);
    } else if (!state.behavior.overlayPositionButton) {
      this.setPickerOpen(false);
    } else if (this.element.matches(':hover')) {
      this.pointerWithin = true;
    }

    this.syncChrome();
    this.notifyInteractive();
  }

  destroy(): void {
    this.releaseHolds();
    this.clearSeekGesture();
    this.abort.abort();
    this.picker = null;
    this.navigationBar = null;
    this.navigationButtons = null;
    this.seekBar = null;
    this.seekRange = null;
    this.seekPlayed = null;
    this.seekBufferedHost = null;
    this.seekReadout = null;
    this.element.remove();
  }

  updateTimeline(state: OverlayTimelineState): void {
    if (!this.seekBar || !this.state?.behavior.overlaySeekBar) {
      return;
    }
    this.applyTimelinePosition(state.currentTime, state.duration);
    this.applyBufferedRanges(state.duration, state.buffered);
  }

  updateTimelinePosition(currentTime: number, duration: number | null): void {
    if (!this.seekBar || !this.state?.behavior.overlaySeekBar) {
      return;
    }
    this.applyTimelinePosition(currentTime, duration);
  }

  /** Ends every live hold, so teardown cannot strand a temporary rate. */
  releaseHolds(): void {
    for (const end of [...this.activeHolds]) {
      end();
    }
  }

  private createChromeButton(className: string, label: string): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    return button;
  }

  private syncChrome(): void {
    const state = this.state;
    if (!state) {
      return;
    }
    const { behavior } = state;
    const policy = speedPolicyFromApplied(behavior);
    this.element.style.opacity = `${canonicalizeOverlayOpacity(behavior.overlayOpacity) / 100}`;
    const { row, column } = overlayPositionToGrid(behavior.overlayPosition);
    this.element.dataset.row = `${row}`;
    this.element.dataset.column = `${column}`;
    this.speedValue.textContent = formatSpeed(behavior.targetSpeed);
    this.speedReadout.disabled =
      canonicalizeSpeed(behavior.targetSpeed) === canonicalizeSpeed(behavior.defaultSpeed);
    this.slower.disabled = !canAdjustSpeed(behavior.targetSpeed, -1, policy);
    this.faster.disabled = !canAdjustSpeed(behavior.targetSpeed, 1, policy);
    syncHotkeyHint(this.slower, state.hotkeys?.decreaseSpeed ?? null, behavior.overlayHotkeyHints);
    syncHotkeyHint(this.faster, state.hotkeys?.increaseSpeed ?? null, behavior.overlayHotkeyHints);
    syncHotkeyHint(
      this.speedReadout,
      state.hotkeys?.resetSpeed ?? null,
      behavior.overlayHotkeyHints,
    );

    if (behavior.overlayPositionButton) {
      if (!this.move.isConnected) {
        this.bar.prepend(this.move);
      }
      this.move.setAttribute('aria-expanded', this.pickerOpen ? 'true' : 'false');
    } else {
      this.move.remove();
    }

    if (behavior.overlaySettingsButton) {
      if (!this.settings.isConnected) {
        this.bar.append(this.settings);
      }
    } else {
      this.settings.remove();
    }

    this.syncNavigation(state);
    this.syncSeek(state);

    if (this.pickerOpen && state.visible && behavior.overlayPositionButton) {
      this.renderPicker();
    } else {
      this.removePicker();
    }
  }

  private syncNavigation(state: OverlayViewState): void {
    const { behavior } = state;
    if (!behavior.overlayNavigationBar) {
      this.removeNavigationBar();
      return;
    }
    const buttons = this.ensureNavigationBar();
    for (const { action } of NAVIGATION_BUTTONS) {
      const button = buttons.get(action);
      if (!button) {
        continue;
      }
      if (action === 'playPause') {
        const label = t(state.paused ? 'navPlay' : 'navPause');
        button.setAttribute('aria-label', label);
        button.replaceChildren(
          state.paused ? createPlayIcon(this.document) : createPauseIcon(this.document),
        );
      }
      const binding = button.disabled ? null : (state.hotkeys?.[action] ?? null);
      syncHotkeyHint(button, binding, behavior.overlayHotkeyHints);
    }
  }

  private ensureNavigationBar(): Map<MediaNavigationAction, HTMLButtonElement> {
    const existing = this.navigationButtons;
    if (this.navigationBar?.isConnected && existing) {
      return existing;
    }
    const bar = this.document.createElement('div');
    bar.className = 'controls controls-nav';
    bar.setAttribute('role', 'group');
    const buttons = new Map<MediaNavigationAction, HTMLButtonElement>();
    for (const { action, label } of NAVIGATION_BUTTONS) {
      const button = HOLD_ACTIONS.has(action)
        ? this.createHoldButton(action, t(label))
        : this.createPressButton(action, t(label));
      button.append(createNavigationIcon(this.document, action));
      buttons.set(action, button);
      bar.append(button);
    }
    this.navigationBar = bar;
    this.navigationButtons = buttons;
    this.bar.after(bar);
    return buttons;
  }

  private syncSeek(state: OverlayViewState): void {
    if (!state.behavior.overlaySeekBar) {
      this.removeSeekBar();
      return;
    }
    this.ensureSeekBar();
  }

  private ensureSeekBar(): HTMLDivElement {
    if (this.seekBar?.isConnected) {
      return this.seekBar;
    }
    const bar = this.document.createElement('div');
    bar.className = 'controls controls-seek';
    bar.setAttribute('role', 'group');

    const wrap = this.document.createElement('div');
    wrap.className = 'seek-track-wrap';

    const track = this.document.createElement('div');
    track.className = 'seek-track';
    track.setAttribute('aria-hidden', 'true');

    const bufferedHost = this.document.createElement('div');
    const played = this.document.createElement('div');
    played.className = 'seek-played';
    track.append(bufferedHost, played);

    const range = this.document.createElement('input');
    range.type = 'range';
    range.className = 'seek-range';
    range.min = '0';
    range.max = '1';
    range.step = 'any';
    range.value = '0';
    range.disabled = true;
    range.setAttribute('aria-label', t('seekVideo'));

    const ticks = this.document.createElement('div');
    ticks.className = 'seek-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    for (let percent = 0; percent <= 100; percent += 10) {
      const tick = this.document.createElement('span');
      tick.className = percent % 50 === 0 ? 'seek-tick seek-tick-major' : 'seek-tick';
      ticks.append(tick);
    }

    const readout = this.document.createElement('span');
    readout.className = 'seek-readout';
    readout.textContent = formatTimelineReadout(0, null);

    wrap.append(track, ticks, range);
    bar.append(wrap, readout);

    const signal = this.abort.signal;
    range.addEventListener(
      'input',
      () => {
        const seconds = Number(range.value);
        if (!Number.isFinite(seconds)) {
          return;
        }
        this.applyTimelinePosition(seconds, this.durationFromRange());
        this.callbacks.onSeek(seconds, 'input');
      },
      { signal },
    );
    range.addEventListener(
      'pointerdown',
      (event) => {
        this.pointerSeeking = true;
        this.pointerCommitted = false;
        this.scrubbing = true;
        try {
          range.setPointerCapture(event.pointerId);
        } catch {
          // Capture is optional. pointerup / pointercancel still end the gesture.
        }
        this.notifyInteractive();
      },
      { signal },
    );
    range.addEventListener('pointerup', () => this.finishPointerSeek(), { signal });
    range.addEventListener('change', () => this.finishPointerSeekOrCommit(), { signal });
    range.addEventListener('pointercancel', () => this.cancelPointerSeek(), { signal });

    this.seekBar = bar;
    this.seekRange = range;
    this.seekPlayed = played;
    this.seekBufferedHost = bufferedHost;
    this.seekReadout = readout;
    this.bufferCacheKey = '';
    (this.navigationBar ?? this.bar).after(bar);
    return bar;
  }

  private removeSeekBar(): void {
    if (!this.seekBar) {
      return;
    }
    this.clearSeekGesture();
    this.seekBar.remove();
    this.seekBar = null;
    this.seekRange = null;
    this.seekPlayed = null;
    this.seekBufferedHost = null;
    this.seekReadout = null;
    this.bufferCacheKey = '';
  }

  private finishPointerSeekOrCommit(): void {
    if (this.pointerSeeking) {
      this.finishPointerSeek();
      return;
    }
    if (this.pointerCommitted) {
      return;
    }
    const seconds = Number(this.seekRange?.value);
    if (Number.isFinite(seconds)) {
      this.callbacks.onSeek(seconds, 'commit');
    }
  }

  private finishPointerSeek(): void {
    if (!this.pointerSeeking || this.pointerCommitted) {
      return;
    }
    this.pointerSeeking = false;
    this.pointerCommitted = true;
    this.scrubbing = false;
    const seconds = Number(this.seekRange?.value);
    if (Number.isFinite(seconds)) {
      this.callbacks.onSeek(seconds, 'commit');
    }
    this.seekRange?.blur();
    this.notifyInteractive();
  }

  private cancelPointerSeek(): void {
    if (!this.pointerSeeking && !this.scrubbing) {
      return;
    }
    this.pointerSeeking = false;
    this.pointerCommitted = true;
    this.scrubbing = false;
    this.seekRange?.blur();
    this.callbacks.onSeekCancel();
    this.notifyInteractive();
  }

  private clearSeekGesture(): void {
    this.pointerSeeking = false;
    this.pointerCommitted = false;
    this.scrubbing = false;
  }

  private durationFromRange(): number | null {
    const max = Number(this.seekRange?.max);
    return Number.isFinite(max) && max > 0 && this.seekRange?.disabled !== true ? max : null;
  }

  private applyTimelinePosition(currentTime: number, duration: number | null): void {
    const range = this.seekRange;
    const played = this.seekPlayed;
    const readout = this.seekReadout;
    const bar = this.seekBar;
    if (!range || !played || !readout || !bar) {
      return;
    }
    const usable = duration != null;
    const shown = clampDisplayedCurrentTime(currentTime, duration);
    range.min = '0';
    range.max = usable ? String(duration) : '1';
    range.step = 'any';
    range.disabled = !usable;
    range.value = usable ? String(shown) : '0';
    bar.toggleAttribute('data-disabled', !usable);
    played.style.left = '0';
    played.style.width = usable && duration > 0 ? `${(shown / duration) * 100}%` : '0%';
    readout.textContent = formatTimelineReadout(shown, duration);
    if (usable) {
      range.setAttribute(
        'aria-valuetext',
        t('seekPosition', [formatMediaTime(shown), formatMediaTime(duration)]),
      );
    } else {
      range.removeAttribute('aria-valuetext');
    }
  }

  private applyBufferedRanges(
    duration: number | null,
    buffered: OverlayTimelineState['buffered'],
  ): void {
    const host = this.seekBufferedHost;
    if (!host) {
      return;
    }
    const key = bufferedStructureKey(duration, buffered);
    if (key === this.bufferCacheKey) {
      return;
    }
    this.bufferCacheKey = key;
    host.replaceChildren();
    if (duration == null || duration <= 0) {
      return;
    }
    for (const range of buffered) {
      const segment = this.document.createElement('div');
      segment.className = 'seek-buffered';
      segment.style.left = `${(range.start / duration) * 100}%`;
      segment.style.width = `${((range.end - range.start) / duration) * 100}%`;
      host.append(segment);
    }
  }

  private removeNavigationBar(): void {
    if (!this.navigationBar) {
      return;
    }
    // The row is going away while a pointer or key may still be down.
    this.releaseHolds();
    this.navigationBar.remove();
    this.navigationBar = null;
    this.navigationButtons = null;
  }

  private createPressButton(action: MediaNavigationAction, label: string): HTMLButtonElement {
    const button = this.createChromeButton('control control-nav', label);
    button.addEventListener(
      'click',
      (event) => {
        if (!button.disabled) {
          this.callbacks.onMediaAction(action, 'press');
        }
        blurAfterPointerClick(event);
      },
      { signal: this.abort.signal },
    );
    return button;
  }

  // Press starts the action and release ends it, so a click never fires it once.
  // Each start allocates a fresh owner so a replaced hold's end is a no-op.
  private createHoldButton(action: MediaNavigationAction, label: string): HTMLButtonElement {
    const button = this.createChromeButton('control control-nav', label);
    const signal = this.abort.signal;
    let activeOwner: TransportHoldOwner | null = null;
    let pointerHold = false;
    let pointerId: number | null = null;
    const end = (): void => {
      const owner = activeOwner;
      pointerHold = false;
      pointerId = null;
      if (!owner) {
        return;
      }
      activeOwner = null;
      this.activeHolds.delete(end);
      this.callbacks.onMediaAction(action, 'end', owner);
      this.notifyInteractive();
    };
    const start = (): void => {
      if (activeOwner || button.disabled) {
        return;
      }
      const owner = {};
      activeOwner = owner;
      this.activeHolds.add(end);
      this.callbacks.onMediaAction(action, 'start', owner);
      this.notifyInteractive();
    };
    // Pointer identity for this press. Chromium can fire lostpointercapture
    // (and a blur) as soon as setPointerCapture runs in a shadow tree.
    // Those must not end a still-down hold; pointerup / pointercancel do.
    const endPointer = (event: Event): void => {
      if (!pointerHold) {
        return;
      }
      if (pointerId != null && event instanceof PointerEvent && event.pointerId !== pointerId) {
        return;
      }
      end();
    };
    button.addEventListener(
      'pointerdown',
      (event) => {
        if (button.disabled || activeOwner) {
          return;
        }
        pointerHold = true;
        pointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // Capture is optional. Document pointerup / pointercancel still end.
        }
        start();
      },
      { signal },
    );
    for (const type of ['pointerup', 'pointercancel'] as const) {
      button.addEventListener(type, endPointer, { signal });
      this.document.addEventListener(type, endPointer, { capture: true, signal });
    }
    button.addEventListener(
      'blur',
      () => {
        if (pointerHold) {
          return;
        }
        end();
      },
      { signal },
    );
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        blurAfterPointerClick(event);
      },
      { signal },
    );
    button.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat || !isActivationKey(event)) {
          return;
        }
        event.preventDefault();
        start();
      },
      { signal },
    );
    button.addEventListener(
      'keyup',
      (event) => {
        if (!isActivationKey(event)) {
          return;
        }
        event.preventDefault();
        end();
      },
      { signal },
    );
    return button;
  }

  private togglePicker(): void {
    this.setPickerOpen(!this.pickerOpen);
  }

  private setPickerOpen(open: boolean): void {
    if (this.pickerOpen === open) {
      if (open) {
        this.renderPicker();
      }
      return;
    }
    this.pickerOpen = open;
    if (!open) {
      this.removePicker();
      this.move.setAttribute('aria-expanded', 'false');
      this.notifyInteractive();
      return;
    }
    this.renderPicker();
    this.move.setAttribute('aria-expanded', 'true');
    this.notifyInteractive();
  }

  private renderPicker(): void {
    const behavior = this.state?.behavior;
    if (!behavior) {
      return;
    }
    if (!this.picker) {
      this.picker = this.document.createElement('div');
      this.picker.className = 'position-picker';
      this.picker.setAttribute('role', 'group');
      this.picker.setAttribute('aria-label', t('overlayPosition'));
      for (const [index, labelKey] of POSITION_LABELS.entries()) {
        const position = index as OverlayPosition;
        const cell = this.document.createElement('button');
        cell.type = 'button';
        cell.className = 'position-cell';
        cell.setAttribute('aria-label', t(labelKey));
        const dot = this.document.createElement('span');
        cell.append(dot);
        cell.addEventListener(
          'click',
          (event) => {
            this.setPickerOpen(false);
            this.callbacks.onSetPosition(position);
            blurAfterPointerClick(event);
          },
          { signal: this.abort.signal },
        );
        this.picker.append(cell);
      }
      this.element.append(this.picker);
    }
    const placement = overlayPositionToGrid(behavior.overlayPosition).row === 2 ? 'above' : 'below';
    this.picker.dataset.placement = placement;
    [...this.picker.children].forEach((node, index) => {
      if (!(node instanceof HTMLButtonElement)) {
        return;
      }
      const selected = behavior.overlayPosition === index;
      node.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const dot = node.firstElementChild;
      if (dot) {
        dot.className = selected ? 'position-dot position-dot-selected' : 'position-dot';
      }
    });
  }

  private removePicker(): void {
    this.picker?.remove();
    this.picker = null;
  }

  private notifyInteractive(): void {
    const behavior = this.state?.behavior;
    const visible = this.state?.visible === true;
    // A live hold keeps the overlay interactive even when hover-hold is off.
    const interactive =
      visible &&
      (this.focusWithin ||
        this.scrubbing ||
        this.activeHolds.size > 0 ||
        (this.pointerWithin && (behavior?.overlayHoverHold ?? false)));
    if (this.lastInteractive === interactive) {
      return;
    }
    this.lastInteractive = interactive;
    this.callbacks.onInteractiveChange(interactive);
  }
}

function createAdjustIcon(document: Document, direction: -1 | 1): SVGSVGElement {
  const svg =
    direction < 0
      ? createSvg(document, [['path', { d: 'M5 12h14' }]])
      : createSvg(document, [
          ['path', { d: 'M5 12h14' }],
          ['path', { d: 'M12 5v14' }],
        ]);
  svg.classList.add('adjust-glyph');
  return svg;
}

function syncHotkeyHint(
  button: HTMLButtonElement,
  binding: HotkeyBinding | null,
  showHint: boolean,
): void {
  button.querySelector('.hotkey-hint')?.remove();
  if (!binding) {
    button.removeAttribute('aria-keyshortcuts');
    return;
  }
  button.setAttribute('aria-keyshortcuts', ariaKeyshortcutsFromBinding(binding));
  if (!showHint) {
    return;
  }
  const hint = button.ownerDocument.createElement('kbd');
  hint.className = 'hotkey-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = visualHotkeyParts(binding).join('\u2009');
  button.append(hint);
}

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter';
}

function blurAfterPointerClick(event: MouseEvent): void {
  if (event.detail === 0 || !(event.currentTarget instanceof HTMLElement)) {
    return;
  }
  event.currentTarget.blur();
}

function createSvg(
  document: Document,
  children: ReadonlyArray<readonly [string, Record<string, string>]>,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [name, attrs] of children) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    svg.append(node);
  }
  return svg;
}

function createMoveIcon(document: Document): SVGSVGElement {
  return createSvg(document, [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M3 9h18' }],
    ['path', { d: 'M3 15h18' }],
    ['path', { d: 'M9 3v18' }],
    ['path', { d: 'M15 3v18' }],
  ]);
}

function createPlayIcon(document: Document): SVGSVGElement {
  return createSvg(document, [['polygon', { points: '6 3 20 12 6 21 6 3' }]]);
}

function createPauseIcon(document: Document): SVGSVGElement {
  return createSvg(document, [
    ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
    ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }],
  ]);
}

function createNavigationIcon(document: Document, action: MediaNavigationAction): SVGSVGElement {
  switch (action) {
    case 'jumpToStart':
      return createSvg(document, [
        ['polygon', { points: '19 20 9 12 19 4 19 20' }],
        ['path', { d: 'M5 19V5' }],
      ]);
    case 'rewind':
      return createSvg(document, [
        ['polygon', { points: '11 19 2 12 11 5 11 19' }],
        ['polygon', { points: '22 19 13 12 22 5 22 19' }],
      ]);
    case 'skipBack':
      return createSvg(document, [
        ['path', { d: 'm11 17-5-5 5-5' }],
        ['path', { d: 'm18 17-5-5 5-5' }],
      ]);
    case 'playPause':
      return createPlayIcon(document);
    case 'skipForward':
      return createSvg(document, [
        ['path', { d: 'm6 17 5-5-5-5' }],
        ['path', { d: 'm13 17 5-5-5-5' }],
      ]);
    case 'fastForward':
      return createSvg(document, [
        ['polygon', { points: '2 19 11 12 2 5 2 19' }],
        ['polygon', { points: '13 19 22 12 13 5 13 19' }],
      ]);
    case 'jumpToEnd':
      return createSvg(document, [
        ['polygon', { points: '5 4 15 12 5 20 5 4' }],
        ['path', { d: 'M19 5v14' }],
      ]);
  }
}

function createSettingsIcon(document: Document): SVGSVGElement {
  return createSvg(document, [
    [
      'path',
      {
        d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ]);
}
