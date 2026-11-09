// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordinaryPlayerOffset } from '../core/player-mount';
import {
  OVERLAY_HOST_TAG,
  OVERLAY_INSET_PX,
  OVERLAY_Z_INDEX,
  VideoOverlay,
} from '../core/video-overlay';
import { OVERLAY_POSITION, type OverlayPosition } from '../settings/site-behavior';
import { tabBehavior } from './tab-behavior-fixture';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

function layoutOverlay(
  position: OverlayPosition,
  mount: HTMLElement | ShadowRoot | null,
  zIndex = '60',
): VideoOverlay {
  const video = document.createElement('video');
  video.getBoundingClientRect = () => rect(100, 80, 640, 360);
  (mount ?? document.body).append(video);
  const overlay = new VideoOverlay(video, () => undefined);
  overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayPosition: position }));
  overlay.setControlled(true);
  if (mount) {
    overlay.setStackingMount({ element: mount, zIndex });
  }
  overlay.layout();
  return overlay;
}

function withFullscreenElement(element: Element): () => void {
  const previous = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => element,
  });
  return () => {
    if (previous) {
      Object.defineProperty(document, 'fullscreenElement', previous);
    } else {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  };
}

describe('player-local placement', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.querySelectorAll(OVERLAY_HOST_TAG).forEach((node) => node.remove());
  });

  it.each([
    [OVERLAY_POSITION.TOP_LEFT, 108, 88],
    [OVERLAY_POSITION.TOP_CENTER, 420, 88],
    [OVERLAY_POSITION.TOP_RIGHT, 732, 88],
    [OVERLAY_POSITION.CENTER_LEFT, 108, 260],
    [OVERLAY_POSITION.CENTER, 420, 260],
    [OVERLAY_POSITION.CENTER_RIGHT, 732, 260],
    [OVERLAY_POSITION.BOTTOM_LEFT, 108, 432],
    [OVERLAY_POSITION.BOTTOM_CENTER, 420, 432],
    [OVERLAY_POSITION.BOTTOM_RIGHT, 732, 432],
  ] as const)(
    'places grid position %s inside an ordinary player',
    (position, viewportX, viewportY) => {
      const mount = document.createElement('div');
      mount.id = 'movie_player';
      mount.style.position = 'relative';
      mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
      document.body.append(mount);
      const overlay = layoutOverlay(position, mount);
      expect(overlay.host.parentElement).toBe(mount);
      expect(overlay.host.style.position).toBe('absolute');
      expect(overlay.host.style.zIndex).toBe('60');
      expect(overlay.host.style.pointerEvents).toBe('none');
      expect(overlay.host.style.left).toBe(`${viewportX - 40}px`);
      expect(overlay.host.style.top).toBe(`${viewportY - 30}px`);
      expect(viewportX).toBeGreaterThan(OVERLAY_INSET_PX);
    },
  );

  it('restores the fixed root portal when the player is transformed or left', () => {
    const mount = document.createElement('div');
    mount.id = 'movie_player';
    mount.style.position = 'relative';
    mount.style.transform = 'scale(1.1)';
    mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
    document.body.append(mount);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
    expect(ordinaryPlayerOffset(mount, 0, 0)).toBeNull();
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);

    mount.style.transform = 'none';
    overlay.layout();
    expect(overlay.host.parentElement).toBe(mount);

    const video = mount.querySelector('video')!;
    document.body.append(video);
    overlay.layout();
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('uses the z-index supplied by the policy and rejects a value that is not a level', () => {
    const mount = document.createElement('div');
    mount.style.position = 'relative';
    mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
    document.body.append(mount);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount, '70');
    expect(overlay.host.style.zIndex).toBe('70');
    overlay.setStackingMount({ element: mount, zIndex: '60; color: red' });
    overlay.layout();
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('uses the shadow host box and keeps a hidden overlay in its root until the video leaves', () => {
    const player = document.createElement('shreddit-player');
    player.style.position = 'relative';
    player.style.borderStyle = 'solid';
    player.style.borderLeftWidth = '4px';
    player.style.borderTopWidth = '6px';
    player.getBoundingClientRect = () => rect(40, 30, 700, 400);
    const root = player.attachShadow({ mode: 'open' });
    document.body.append(player);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, root, '1');
    expect(overlay.host.parentNode).toBe(root);
    expect(overlay.host.style.position).toBe('absolute');
    expect(overlay.host.style.zIndex).toBe('1');
    expect(overlay.host.style.left).toBe('64px');
    expect(overlay.host.style.top).toBe('52px');
    overlay.setBehavior(tabBehavior(1, { overlayVisible: false, overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.host.parentNode).toBe(root);
    const video = root.querySelector('video')!;
    document.body.append(video);
    overlay.layout();
    expect(overlay.host.parentNode).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    overlay.destroy();
  });

  it('uses fixed fullscreen placement and returns to a local shadow mount on exit', () => {
    const player = document.createElement('shreddit-player');
    player.style.position = 'relative';
    player.getBoundingClientRect = () => rect(40, 30, 700, 400);
    const root = player.attachShadow({ mode: 'open' });
    document.body.append(player);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, root, '1');
    const restore = withFullscreenElement(player);
    try {
      overlay.layout();
      expect(overlay.host.parentNode).toBe(root);
      expect(overlay.host.style.position).toBe('fixed');
      expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
    } finally {
      restore();
    }
    overlay.layout();
    expect(overlay.host.parentNode).toBe(root);
    expect(overlay.host.style.position).toBe('absolute');
    expect(overlay.host.style.zIndex).toBe('1');
    overlay.destroy();
  });

  it('rejects a shadow mount slotted into a transformed wrapper', () => {
    const outer = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.style.transform = 'scale(2)';
    wrapper.append(document.createElement('slot'));
    outer.attachShadow({ mode: 'open' }).append(wrapper);
    const player = document.createElement('shreddit-player');
    player.style.position = 'relative';
    const root = player.attachShadow({ mode: 'open' });
    outer.append(player);
    document.body.append(outer);
    expect(ordinaryPlayerOffset(root, 100, 80)).toBeNull();
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, root, '1');
    expect(overlay.host.parentNode).toBe(document.documentElement);
    overlay.destroy();
  });

  it.each([
    [
      'transform',
      (node: HTMLElement) => {
        node.style.transform = 'scale(2)';
      },
    ],
    [
      'filter',
      (node: HTMLElement) => {
        node.style.filter = 'blur(1px)';
      },
    ],
    [
      'will-change',
      (node: HTMLElement) => {
        node.style.willChange = 'transform';
      },
    ],
  ] as const)('falls back when an ancestor %s would scale local coordinates', (_name, style) => {
    const ancestor = document.createElement('div');
    style(ancestor);
    const mount = document.createElement('div');
    mount.style.position = 'relative';
    mount.getBoundingClientRect = () => rect(80, 60, 700, 400);
    ancestor.append(mount);
    document.body.append(ancestor);
    expect(ordinaryPlayerOffset(mount, 100, 80)).toBeNull();
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('falls back when a shadow host above the player is transformed', () => {
    const shadowHost = document.createElement('div');
    shadowHost.style.transform = 'scale(2)';
    const mount = document.createElement('div');
    mount.style.position = 'relative';
    mount.getBoundingClientRect = () => rect(80, 60, 700, 400);
    shadowHost.attachShadow({ mode: 'open' }).append(mount);
    document.body.append(shadowHost);
    expect(ordinaryPlayerOffset(mount, 100, 80)).toBeNull();
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
  });

  it('keeps player placement while hidden and restores the portal when the mount is cleared', () => {
    const mount = document.createElement('div');
    mount.style.position = 'relative';
    mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
    document.body.append(mount);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
    overlay.setBehavior(tabBehavior(1, { overlayVisible: false, overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.parentElement).toBe(mount);
    expect(overlay.host.style.position).toBe('absolute');
    expect(overlay.host.style.zIndex).toBe('60');

    overlay.setStackingMount(null);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('restores the fixed portal when auto-hide expires before the watch mount is cleared', () => {
    vi.useFakeTimers();
    try {
      const mount = document.createElement('div');
      mount.style.position = 'relative';
      mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
      document.body.append(mount);
      const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
      overlay.setBehavior(
        tabBehavior(1, {
          overlayAutoHide: true,
          overlayAutoHideDelayMs: 200,
          overlayPosition: OVERLAY_POSITION.TOP_LEFT,
        }),
      );
      vi.advanceTimersByTime(200);
      overlay.setStackingMount(null);
      overlay.layout();
      expect(overlay.host.style.visibility).toBe('hidden');
      expect(overlay.host.parentElement).toBe(document.documentElement);
      expect(overlay.host.style.position).toBe('fixed');
      expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores fixed placement across fullscreen while the overlay stays hidden', () => {
    const wrap = document.createElement('div');
    const mount = document.createElement('div');
    mount.style.position = 'relative';
    mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
    wrap.append(mount);
    document.body.append(wrap);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
    overlay.setBehavior(tabBehavior(1, { overlayVisible: false, overlayAutoHide: false }));
    overlay.layout();
    const restore = withFullscreenElement(wrap);
    try {
      overlay.layout();
      expect(overlay.host.style.visibility).toBe('hidden');
      expect(overlay.host.parentElement).toBe(wrap);
      expect(overlay.host.style.position).toBe('fixed');
      expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
    } finally {
      restore();
    }
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
    overlay.setBehavior(
      tabBehavior(1, {
        overlayVisible: true,
        overlayAutoHide: false,
        overlayPosition: OVERLAY_POSITION.TOP_LEFT,
      }),
    );
    overlay.layout();
    expect(overlay.host.parentElement).toBe(mount);
    expect(overlay.host.style.position).toBe('absolute');
    expect(overlay.host.style.zIndex).toBe('60');
  });

  it('lets a mounted control receive one click and keeps the press off the player', () => {
    const mount = document.createElement('div');
    mount.style.position = 'relative';
    mount.getBoundingClientRect = () => rect(40, 30, 700, 400);
    let presses = 0;
    let playerClicks = 0;
    mount.addEventListener('mousedown', (event) => {
      presses += 1;
      event.preventDefault();
    });
    mount.addEventListener('click', () => {
      playerClicks += 1;
    });
    document.body.append(mount);
    const overlay = layoutOverlay(OVERLAY_POSITION.TOP_LEFT, mount);
    const faster =
      overlay.host.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Faster"]');
    if (!faster) {
      throw new Error('Expected a Faster button');
    }
    let clicks = 0;
    faster.addEventListener('click', () => {
      clicks += 1;
    });
    const pointerUp = new PointerEvent('pointerup', { bubbles: true, composed: true, button: 0 });
    faster.dispatchEvent(pointerUp);
    expect(clicks).toBe(0);
    faster.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true }),
    );
    faster.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    faster.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(clicks).toBe(1);
    expect(presses).toBe(0);
    expect(playerClicks).toBe(0);
  });
});
