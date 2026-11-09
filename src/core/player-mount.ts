// SPDX-License-Identifier: GPL-3.0-only

import { isShadowRoot } from '../dom/guards';

/** A resolved in-player mount. A shadow root uses its host's coordinate box. */
export type PlayerStackingMount = {
  element: Element | ShadowRoot;
  zIndex: string;
};

const LOCAL_Z_INDEX = /^[0-9]{1,4}$/;
const mounted = new WeakSet<HTMLElement>();

function isIdentity(value: string): boolean {
  return value === 'none' || value === '';
}

function ordinaryBox(style: CSSStyleDeclaration): boolean {
  if (!isIdentity(style.transform) || !isIdentity(style.filter) || !isIdentity(style.perspective)) {
    return false;
  }
  const willChange = style.willChange.split(',').map((part) => part.trim());
  return !willChange.includes('transform') && !willChange.includes('filter');
}

function parentOrShadowHost(element: Element): Element | null {
  if (element.assignedSlot) {
    return element.assignedSlot;
  }
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

/**
 * Viewport subtraction is only valid when no ancestor scales or filters the
 * mount. A transformed ancestor falls back to the root portal.
 */
function ancestorBreaksLocalCoordinates(mount: Element, view: Window): boolean {
  let ancestor = parentOrShadowHost(mount);
  while (ancestor) {
    if (!ordinaryBox(view.getComputedStyle(ancestor))) {
      return true;
    }
    ancestor = parentOrShadowHost(ancestor);
  }
  return false;
}

/** Ordinary boxes only. A transform or filter falls back to the root portal. */
export function ordinaryPlayerOffset(
  mount: Element | ShadowRoot,
  viewportX: number,
  viewportY: number,
): { x: number; y: number } | null {
  const view = mount.ownerDocument.defaultView;
  if (!view || !mount.isConnected) {
    return null;
  }
  const box = isShadowRoot(mount) ? mount.host : mount;
  const style = view.getComputedStyle(box);
  if (style.position === 'static' || !ordinaryBox(style)) {
    return null;
  }
  if (ancestorBreaksLocalCoordinates(box, view)) {
    return null;
  }
  const borderLeft = Number.parseFloat(style.borderLeftWidth);
  const borderTop = Number.parseFloat(style.borderTopWidth);
  if (!Number.isFinite(borderLeft) || !Number.isFinite(borderTop)) {
    return null;
  }
  const rect = box.getBoundingClientRect();
  return {
    x: viewportX - rect.left - borderLeft,
    y: viewportY - rect.top - borderTop,
  };
}

/**
 * Stop compatibility mouse events from leaving the host after the control has
 * seen them. A player that cancels click from a bubbling mousedown then never
 * runs. Pointer events stay available so press-and-hold and slider drags keep
 * their native pointer capture. Ancestor capture listeners are outside this
 * boundary.
 */
export function installPlayerMountGuards(host: HTMLElement, signal: AbortSignal): void {
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    host.addEventListener(
      type,
      (event) => {
        if (!mounted.has(host)) {
          return;
        }
        event.stopPropagation();
      },
      { signal },
    );
  }
}

export function hostStaysInMount(host: HTMLElement, mount: Element | ShadowRoot | null): boolean {
  return mount != null && mount.isConnected && host.parentNode === mount;
}

export function placePlayerMount(
  host: HTMLElement,
  mount: Element | ShadowRoot,
  viewportX: number,
  viewportY: number,
  zIndex: string,
): boolean {
  if (!LOCAL_Z_INDEX.test(zIndex)) {
    mounted.delete(host);
    return false;
  }
  const local = ordinaryPlayerOffset(mount, viewportX, viewportY);
  if (!local) {
    mounted.delete(host);
    return false;
  }
  mounted.add(host);
  host.style.setProperty('position', 'absolute', 'important');
  host.style.setProperty('z-index', zIndex, 'important');
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
