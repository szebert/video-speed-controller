// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { ordinaryPlayerOffset, PLAYER_LOCAL_Z_INDEX } from '../core/player-mount';
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

function layoutOverlay(position: OverlayPosition, mount: HTMLElement | null): VideoOverlay {
  const video = document.createElement('video');
  video.getBoundingClientRect = () => rect(100, 80, 640, 360);
  (mount ?? document.body).append(video);
  const overlay = new VideoOverlay(video, () => undefined);
  overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayPosition: position }));
  overlay.setControlled(true);
  if (mount) {
    overlay.setStackingMount(mount);
  }
  overlay.layout();
  return overlay;
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
      expect(overlay.host.style.zIndex).toBe(PLAYER_LOCAL_Z_INDEX);
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
});
