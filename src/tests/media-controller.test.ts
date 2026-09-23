// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * jsdom 30.1+ queues native `ratechange` as a document task. Flushing those
 * tasks can reschedule the defense retry after the current pending-timer set
 * is captured, so the retry needs a second flush.
 */
function flushRateRetry(): void {
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();
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

function pausableVideo(paused: boolean): HTMLVideoElement {
  const video = document.createElement('video');
  document.body.append(video);
  let value = paused;
  Object.defineProperty(video, 'paused', {
    configurable: true,
    get: () => value,
  });
  vi.spyOn(video, 'play').mockImplementation(() => {
    value = false;
    return Promise.resolve();
  });
  vi.spyOn(video, 'pause').mockImplementation(() => {
    value = true;
  });
  return video;
}

describe('MediaController temporary transport rate', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('overrides the target while active and restores it on end', () => {
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);

    const session = controller.beginTemporaryRate(3);
    expect(session).not.toBeNull();
    expect(video.playbackRate).toBe(3);
    expect(controller.targetSpeed).toBe(2);
    expect(controller.temporaryRate).toBe(3);

    controller.endTemporaryRate(session!);
    expect(video.playbackRate).toBe(2);
    expect(controller.temporaryRate).toBeNull();
    controller.destroy();
  });

  it('defers a target changed mid-session until the session ends', () => {
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    const session = controller.beginTemporaryRate(3)!;

    controller.setTarget(1.5);
    expect(video.playbackRate).toBe(3);

    controller.endTemporaryRate(session);
    expect(video.playbackRate).toBe(1.5);
    controller.destroy();
  });

  it('ends only the session that owns the token', () => {
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    const first = controller.beginTemporaryRate(3)!;
    const second = controller.beginTemporaryRate(4)!;
    expect(video.playbackRate).toBe(4);

    controller.endTemporaryRate(first);
    expect(video.playbackRate).toBe(4);
    expect(controller.temporaryRate).toBe(4);

    controller.endTemporaryRate(second);
    expect(video.playbackRate).toBe(2);

    // A second end for the same token cannot reset the rate again.
    controller.setTarget(1.5);
    controller.endTemporaryRate(second);
    expect(video.playbackRate).toBe(1.5);
    controller.destroy();
  });

  it('rejects a non-positive or non-finite rate', () => {
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    expect(controller.beginTemporaryRate(0)).toBeNull();
    expect(controller.beginTemporaryRate(-1)).toBeNull();
    expect(controller.beginTemporaryRate(Number.NaN)).toBeNull();
    expect(controller.temporaryRate).toBeNull();
    expect(video.playbackRate).toBe(2);
    controller.destroy();
  });

  it('reasserts the temporary rate without surrendering ownership', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    const session = controller.beginTemporaryRate(3)!;

    video.playbackRate = 1.5;
    video.dispatchEvent(new Event('ratechange'));
    flushRateRetry();
    expect(video.playbackRate).toBe(3);

    // A relentless page cannot make a transport session hand over ownership
    // or stop the temporary rate from being written back.
    surrender(video, 1.5);
    for (let index = 0; index < 8; index += 1) {
      video.playbackRate = 1.5;
      video.dispatchEvent(new Event('ratechange'));
      flushRateRetry();
    }
    expect(controller.surrendered).toBe(false);
    expect(controller.temporaryRate).toBe(3);
    expect(video.playbackRate).toBe(3);

    controller.endTemporaryRate(session);
    expect(video.playbackRate).toBe(2);
    expect(controller.surrendered).toBe(false);
    controller.destroy();
    vi.useRealTimers();
  });

  it('restores the paused state it resumed from', () => {
    const video = pausableVideo(true);
    const controller = new MediaController(video);
    controller.setTarget(2);

    const session = controller.beginTemporaryRate(3, { resumePlayback: true })!;
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(3);

    controller.endTemporaryRate(session);
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(2);
    controller.destroy();
  });

  it('leaves an already playing video playing', () => {
    const video = pausableVideo(false);
    const controller = new MediaController(video);
    controller.setTarget(2);
    const session = controller.beginTemporaryRate(3, { resumePlayback: true })!;
    expect(video.play).not.toHaveBeenCalled();

    controller.endTemporaryRate(session);
    expect(video.paused).toBe(false);
    controller.destroy();
  });

  it('cannot be resurrected by a play() that resolves after the session ended', async () => {
    const video = document.createElement('video');
    document.body.append(video);
    let paused = true;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    let resolvePlay: (() => void) | undefined;
    vi.spyOn(video, 'play').mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          resolvePlay = () => {
            if (paused) {
              reject(new DOMException('The play() request was interrupted', 'AbortError'));
              return;
            }
            paused = false;
            resolve();
          };
        }),
    );
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const controller = new MediaController(video);
    controller.setTarget(2);

    const session = controller.beginTemporaryRate(3, { resumePlayback: true })!;
    controller.endTemporaryRate(session);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.playbackRate).toBe(2);

    resolvePlay?.();
    await Promise.resolve();
    controller.endTemporaryRate(session);
    expect(controller.temporaryRate).toBeNull();
    expect(video.playbackRate).toBe(2);
    expect(video.paused).toBe(true);
    controller.destroy();
  });

  it('restores the captured page rate when the controller was already surrendered', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    surrender(video, 1.5);
    expect(controller.surrendered).toBe(true);

    const first = controller.beginTemporaryRate(3)!;
    expect(video.playbackRate).toBe(3);
    const second = controller.beginTemporaryRate(4)!;
    expect(video.playbackRate).toBe(4);

    controller.endTemporaryRate(first);
    expect(video.playbackRate).toBe(4);
    controller.endTemporaryRate(second);
    expect(video.playbackRate).toBe(1.5);
    expect(controller.surrendered).toBe(true);

    controller.destroy();
    expect(video.playbackRate).toBe(1.5);
    vi.useRealTimers();
  });

  it('pauses a video it resumed even after the element is detached', () => {
    const video = pausableVideo(true);
    const controller = new MediaController(video);
    controller.setTarget(2);
    controller.beginTemporaryRate(3, { resumePlayback: true });
    expect(video.paused).toBe(false);

    video.remove();
    controller.destroy();
    expect(video.paused).toBe(true);
  });

  it('does not capture the temporary rate as the destroy baseline', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const controller = new MediaController(video);
    controller.setTarget(2);
    surrender(video, 1.5);
    const session = controller.beginTemporaryRate(3)!;
    expect(video.playbackRate).toBe(3);

    controller.setTarget(2.5);
    expect(video.playbackRate).toBe(3);

    controller.endTemporaryRate(session);
    expect(video.playbackRate).toBe(2.5);

    controller.destroy();
    expect(video.playbackRate).toBe(1.5);
    vi.useRealTimers();
  });

  it('ends an active session on destroy and restores the page baseline', () => {
    const video = pausableVideo(true);
    video.playbackRate = 1.25;
    const controller = new MediaController(video);
    controller.setTarget(2);
    controller.beginTemporaryRate(3, { resumePlayback: true });
    expect(video.paused).toBe(false);

    controller.destroy();
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(1.25);
  });

  it('does not resume a video the page paused during fast forward', () => {
    const video = pausableVideo(false);
    const controller = new MediaController(video);
    controller.setTarget(2);
    const session = controller.beginTemporaryRate(3, { resumePlayback: true })!;
    expect(video.play).not.toHaveBeenCalled();
    video.pause();
    controller.endTemporaryRate(session);
    expect(video.paused).toBe(true);
    expect(video.play).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('rewinds without writing a negative playbackRate', () => {
    const video = pausableVideo(false);
    const controller = new MediaController(video);
    controller.setTarget(1.5);
    const session = controller.beginRewind(1);
    expect(session).not.toBeNull();
    expect(controller.temporaryRate).toBeNull();
    expect(video.playbackRate).toBe(1.5);
    expect(video.paused).toBe(true);

    video.playbackRate = 4;
    video.dispatchEvent(new Event('ratechange'));
    expect(video.playbackRate).toBe(4);

    controller.endTemporaryRate(session!);
    expect(video.playbackRate).toBe(1.5);
    expect(video.paused).toBe(false);
    controller.destroy();
  });

  it('rejects a non-positive rewind magnitude', () => {
    const video = pausableVideo(false);
    const controller = new MediaController(video);
    controller.setTarget(2);
    expect(controller.beginRewind(0)).toBeNull();
    expect(controller.beginRewind(-1)).toBeNull();
    expect(controller.beginRewind(Number.NaN)).toBeNull();
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(2);
    controller.destroy();
  });

  it('restores pause after fast forward is replaced by rewind', () => {
    const video = pausableVideo(true);
    const controller = new MediaController(video);
    controller.setTarget(2);
    const first = controller.beginTemporaryRate(3, { resumePlayback: true })!;
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(3);

    const second = controller.beginRewind(2)!;
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(2);
    expect(controller.temporaryRate).toBeNull();

    controller.endTemporaryRate(first);
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(2);

    controller.endTemporaryRate(second);
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(2);
    controller.destroy();
  });

  it('restores play after rewind is replaced by fast forward', () => {
    const video = pausableVideo(false);
    const controller = new MediaController(video);
    controller.setTarget(2);
    const first = controller.beginRewind(1)!;
    expect(video.paused).toBe(true);

    const second = controller.beginTemporaryRate(4, { resumePlayback: true })!;
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(4);

    controller.endTemporaryRate(first);
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(4);

    controller.endTemporaryRate(second);
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(2);
    controller.destroy();
  });

  it('defers a target changed during rewind until the session ends', () => {
    const video = pausableVideo(false);
    const controller = new MediaController(video);
    controller.setTarget(2);
    const session = controller.beginRewind(1)!;
    controller.setTarget(1.25);
    expect(video.playbackRate).toBe(2);
    controller.endTemporaryRate(session);
    expect(video.playbackRate).toBe(1.25);
    controller.destroy();
  });
});
