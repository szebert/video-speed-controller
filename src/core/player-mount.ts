// SPDX-License-Identifier: GPL-3.0-only

/**
 * In-player level verified on a public YouTube watch page: above the video
 * container (z-index 10) and control bar (59), below the settings menu (2300).
 * The player stacking context keeps this under the page header.
 */
export const PLAYER_LOCAL_Z_INDEX = '60';

const mounted = new WeakSet<HTMLElement>();
const suppressTrustedClick = new WeakSet<HTMLElement>();

function isIdentity(value: string): boolean {
  return value === 'none' || value === '';
}

/** Ordinary boxes only. A transform or filter falls back to the root portal. */
export function ordinaryPlayerOffset(
  mount: Element,
  viewportX: number,
  viewportY: number,
): { x: number; y: number } | null {
  const view = mount.ownerDocument.defaultView;
  if (!view || !mount.isConnected) {
    return null;
  }
  const style = view.getComputedStyle(mount);
  if (style.position === 'static' || !isIdentity(style.transform) || !isIdentity(style.filter)) {
    return null;
  }
  if (!isIdentity(style.perspective)) {
    return null;
  }
  const willChange = style.willChange.split(',').map((part) => part.trim());
  if (willChange.includes('transform') || willChange.includes('filter')) {
    return null;
  }
  const borderLeft = Number.parseFloat(style.borderLeftWidth);
  const borderTop = Number.parseFloat(style.borderTopWidth);
  if (!Number.isFinite(borderLeft) || !Number.isFinite(borderTop)) {
    return null;
  }
  const rect = mount.getBoundingClientRect();
  return {
    x: viewportX - rect.left - borderLeft,
    y: viewportY - rect.top - borderTop,
  };
}

function rangeControl(event: Event): HTMLInputElement | null {
  const input = event.composedPath().find((node) => node instanceof HTMLInputElement);
  return input instanceof HTMLInputElement && input.type === 'range' ? input : null;
}

function scrubRange(input: HTMLInputElement, clientX: number): void {
  const rect = input.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }
  const min = Number(input.min);
  const max = Number(input.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return;
  }
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const step = Number(input.step);
  let value = min + ratio * (max - min);
  if (Number.isFinite(step) && step > 0) {
    value = min + Math.round((value - min) / step) * step;
  }
  input.value = String(Math.min(max, Math.max(min, value)));
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

/**
 * Players often cancel click after mousedown. While a host is player-mounted,
 * presses stay on the overlay and sliders still update.
 */
export function installPlayerMountGuards(host: HTMLElement, signal: AbortSignal): void {
  host.addEventListener(
    'click',
    (event) => {
      if (!mounted.has(host) || !suppressTrustedClick.has(host) || !event.isTrusted) {
        return;
      }
      suppressTrustedClick.delete(host);
      event.stopPropagation();
    },
    { capture: true, signal },
  );
  for (const type of ['mousedown', 'pointerdown', 'pointermove', 'pointerup', 'click'] as const) {
    host.addEventListener(
      type,
      (event) => {
        if (!mounted.has(host)) {
          return;
        }
        if (type !== 'pointermove') {
          event.stopPropagation();
        }
        if ((type === 'pointerdown' || type === 'pointermove') && event instanceof PointerEvent) {
          const range = rangeControl(event);
          if (range && (type === 'pointerdown' || event.buttons === 1)) {
            scrubRange(range, event.clientX);
          }
        }
        if (type !== 'pointerup' || !(event instanceof PointerEvent) || event.button !== 0) {
          return;
        }
        const button = event.composedPath().find((node) => node instanceof HTMLButtonElement);
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return;
        }
        suppressTrustedClick.add(host);
        button.click();
      },
      { signal },
    );
  }
}

export function hostStaysInMount(host: HTMLElement, mount: Element | null): boolean {
  return mount != null && mount.isConnected && host.parentNode === mount;
}

export function placePlayerMount(
  host: HTMLElement,
  mount: Element,
  viewportX: number,
  viewportY: number,
): boolean {
  const local = ordinaryPlayerOffset(mount, viewportX, viewportY);
  if (!local) {
    mounted.delete(host);
    return false;
  }
  mounted.add(host);
  host.style.setProperty('position', 'absolute', 'important');
  host.style.setProperty('z-index', PLAYER_LOCAL_Z_INDEX, 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  if (host.parentNode !== mount) {
    mount.append(host);
  }
  host.style.setProperty('left', `${local.x}px`, 'important');
  host.style.setProperty('top', `${local.y}px`, 'important');
  return true;
}

export function releasePlayerMount(host: HTMLElement): void {
  mounted.delete(host);
}
