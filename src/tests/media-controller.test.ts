// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { MediaController } from '../core/media-controller';

describe('MediaController isolation', () => {
  it('adopts locally without changing another video', () => {
    vi.useFakeTimers();
    const a = document.createElement('video');
    const b = document.createElement('video');
    const ca = new MediaController(a);
    const cb = new MediaController(b);
    ca.setTarget(2);
    cb.setTarget(2);
    expect(a.playbackRate).toBe(2);
    expect(b.playbackRate).toBe(2);

    a.playbackRate = 1.5;
    a.dispatchEvent(new Event('ratechange'));
    for (let i = 0; i < 4; i += 1) {
      vi.runOnlyPendingTimers();
      a.playbackRate = 1.5;
      a.dispatchEvent(new Event('ratechange'));
    }

    expect(ca.surrendered).toBe(true);
    expect(b.playbackRate).toBe(2);
    expect(cb.surrendered).toBe(false);

    cb.setTarget(2.25);
    ca.setTarget(2.25);
    expect(a.playbackRate).toBe(2.25);
    expect(b.playbackRate).toBe(2.25);
    ca.destroy();
    cb.destroy();
    vi.useRealTimers();
  });

  it('restores 1x on destroy when still controlling the video', () => {
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    expect(video.playbackRate).toBe(2);

    controller.destroy();
    expect(video.playbackRate).toBe(1);
  });

  it('leaves a surrendered video at the player rate on destroy', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    video.playbackRate = 1.5;
    video.dispatchEvent(new Event('ratechange'));
    for (let i = 0; i < 4; i += 1) {
      vi.runOnlyPendingTimers();
      video.playbackRate = 1.5;
      video.dispatchEvent(new Event('ratechange'));
    }
    expect(controller.surrendered).toBe(true);

    controller.destroy();
    expect(video.playbackRate).toBe(1.5);
    vi.useRealTimers();
  });

  it('does not change rate on destroy when no target was applied', () => {
    const video = document.createElement('video');
    video.playbackRate = 1.25;
    const controller = new MediaController(video);
    controller.destroy();
    expect(video.playbackRate).toBe(1.25);
  });
});
