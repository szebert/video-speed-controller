// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { MediaController } from '../core/media-controller';

function surrender(video: HTMLVideoElement, playerRate: number): void {
  video.playbackRate = playerRate;
  video.dispatchEvent(new Event('ratechange'));
  for (let index = 0; index < 4; index += 1) {
    vi.runOnlyPendingTimers();
    video.playbackRate = playerRate;
    video.dispatchEvent(new Event('ratechange'));
  }
}

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

    surrender(a, 1.5);

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

  it('restores the captured 1.00 baseline on destroy', () => {
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    expect(video.playbackRate).toBe(2);

    controller.destroy();
    expect(video.playbackRate).toBe(1);
  });

  it('restores a non-1 page baseline on destroy', () => {
    const video = document.createElement('video');
    video.playbackRate = 1.25;
    const controller = new MediaController(video);
    controller.setTarget(3);
    controller.setTarget(2);
    expect(video.playbackRate).toBe(2);

    controller.destroy();
    expect(video.playbackRate).toBe(1.25);
  });

  it('leaves a surrendered video at the player rate on destroy', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    surrender(video, 1.5);
    expect(controller.surrendered).toBe(true);

    controller.destroy();
    expect(video.playbackRate).toBe(1.5);
    vi.useRealTimers();
  });

  it('captures the player rate as a new baseline after retaking control', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    video.playbackRate = 1.25;
    const controller = new MediaController(video);
    controller.setTarget(3);
    surrender(video, 1.5);
    controller.setTarget(2);
    expect(video.playbackRate).toBe(2);
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

  it('emits ownership loss on adopt and regain on retake', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const owned: boolean[] = [];
    const controller = new MediaController(video, (value) => {
      owned.push(value);
    });
    controller.setTarget(2);
    expect(owned).toEqual([true]);
    surrender(video, 1.5);
    expect(owned).toEqual([true, false]);
    controller.setTarget(1.75);
    expect(owned).toEqual([true, false, true]);
    controller.destroy();
    vi.useRealTimers();
  });
});
