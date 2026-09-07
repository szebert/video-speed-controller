// SPDX-License-Identifier: GPL-3.0-only

import { speedPolicyFromApplied } from '../core/applied-tab-behavior';
import { ariaKeyshortcutsFromBinding, visualHotkeyParts } from '../core/hotkey-format';
import { canAdjustSpeed, formatSpeed } from '../core/speed';
import { t, type MessageKey } from '../i18n/t';
import type { HotkeyBinding } from '../settings/hotkey-binding';
import {
  canonicalizeOverlayOpacity,
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
      () => {
        if (!this.slower.disabled) {
          this.callbacks.onAdjust(-1);
        }
      },
      { signal: this.abort.signal },
    );

    this.speedReadout = document.createElement('div');
    this.speedReadout.className = 'speed';

    this.faster = this.createChromeButton('control control-adjust', t('faster'));
    this.faster.append(createAdjustIcon(document, 1));
    this.faster.addEventListener(
      'click',
      () => {
        if (!this.faster.disabled) {
          this.callbacks.onAdjust(1);
        }
      },
      { signal: this.abort.signal },
    );

    this.settings = this.createChromeButton('control control-icon', t('openSettings'));
    this.settings.append(createSettingsIcon(document));
    this.settings.addEventListener(
      'click',
      () => {
        this.setPickerOpen(false);
        this.callbacks.onOpenSettings();
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
    this.abort.abort();
    this.picker = null;
    this.element.remove();
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
    this.speedReadout.textContent = formatSpeed(behavior.targetSpeed);
    this.slower.disabled = !canAdjustSpeed(behavior.targetSpeed, -1, policy);
    this.faster.disabled = !canAdjustSpeed(behavior.targetSpeed, 1, policy);
    syncHotkeyHint(this.slower, state.hotkeys?.decreaseSpeed ?? null);
    syncHotkeyHint(this.faster, state.hotkeys?.increaseSpeed ?? null);

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

    if (this.pickerOpen && state.visible && behavior.overlayPositionButton) {
      this.renderPicker();
    } else {
      this.removePicker();
    }
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
    const interactive =
      visible &&
      (this.pickerOpen ||
        this.focusWithin ||
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

function syncHotkeyHint(button: HTMLButtonElement, binding: HotkeyBinding | null): void {
  button.querySelector('.hotkey-hint')?.remove();
  if (!binding) {
    button.removeAttribute('aria-keyshortcuts');
    return;
  }
  button.setAttribute('aria-keyshortcuts', ariaKeyshortcutsFromBinding(binding));
  const hint = button.ownerDocument.createElement('kbd');
  hint.className = 'hotkey-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = visualHotkeyParts(binding).join('\u2009');
  button.append(hint);
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
