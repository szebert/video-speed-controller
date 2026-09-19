// SPDX-License-Identifier: GPL-3.0-only

import { speedPolicyFromApplied } from '../core/applied-tab-behavior';
import type { MediaNavigationAction, TransportHoldOwner } from '../core/controller-action';
import { ariaKeyshortcutsFromBinding, visualHotkeyParts } from '../core/hotkey-format';
import { canAdjustSpeed, formatSpeed } from '../core/speed';
import { t, type MessageKey } from '../i18n/t';
import type { HotkeyBinding } from '../settings/hotkey-binding';
import {
  canonicalizeOverlayOpacity,
  HOLD_ACTIONS,
  overlayPositionToGrid,
  type OverlayPosition,
} from '../settings/site-behavior';
import type { OverlayViewCallbacks, OverlayViewState } from './types';

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
  readonly speedReadout: HTMLDivElement;

  private readonly document: Document;
  private readonly abort = new AbortController();
  private readonly bar: HTMLDivElement;
  private readonly move: HTMLButtonElement;
  private readonly slower: HTMLButtonElement;
  private readonly faster: HTMLButtonElement;
  private readonly settings: HTMLButtonElement;
  private navigationBar: HTMLDivElement | null = null;
  private navigationButtons: Map<MediaNavigationAction, HTMLButtonElement> | null = null;
  private readonly activeHolds = new Set<() => void>();
  private picker: HTMLDivElement | null = null;
  private pickerOpen = false;
  private pointerWithin = false;
  private focusWithin = false;
  private lastInteractive: boolean | null = null;
  private state: OverlayViewState | null = null;

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

    this.speedReadout = document.createElement('div');
    this.speedReadout.className = 'speed';

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
    this.abort.abort();
    this.picker = null;
    this.navigationBar = null;
    this.navigationButtons = null;
    this.element.remove();
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
    this.element.dataset.column = `${overlayPositionToGrid(behavior.overlayPosition).column}`;
    this.speedReadout.textContent = formatSpeed(behavior.targetSpeed);
    this.slower.disabled = !canAdjustSpeed(behavior.targetSpeed, -1, policy);
    this.faster.disabled = !canAdjustSpeed(behavior.targetSpeed, 1, policy);
    syncHotkeyHint(this.slower, state.hotkeys?.decreaseSpeed ?? null, behavior.overlayHotkeyHints);
    syncHotkeyHint(this.faster, state.hotkeys?.increaseSpeed ?? null, behavior.overlayHotkeyHints);

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
    this.element.insertBefore(bar, this.picker);
    return buttons;
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
