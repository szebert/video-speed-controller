// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { REWIND_SEEKS_PER_SECOND, startRewind, type RewindScheduler } from '../core/rewind';

type Range = { start: number; end: number };

function stubVideo(options: {
  currentTime?: number;
  duration?: number;
  seekable?: Range[];
  seeking?: boolean;
  seekThrows?: boolean;
}): HTMLVideoElement {
  const video = document.createElement('video');
  let currentTime = options.currentTime ?? 0;
  let seeking = options.seeking ?? false;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      if (options.seekThrows) {
        throw new DOMException('not seekable', 'InvalidStateError');
      }
      currentTime = value;
    },
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => options.duration ?? Number.NaN,
  });
  Object.defineProperty(video, 'seeking', {
    configurable: true,
    get: () => seeking,
    set: (value: boolean) => {
      seeking = value;
    },
  });
  if (options.seekable) {
    const ranges = options.seekable;
    Object.defineProperty(video, 'seekable', {
      configurable: true,
      get: () => ({
        length: ranges.length,
        start: (index: number) => ranges[index]?.start ?? 0,
        end: (index: number) => ranges[index]?.end ?? 0,
      }),
    });
  }
  document.body.append(video);
  return video;
}

function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map<number, (time: number) => void>();
  const scheduler: RewindScheduler = {
    now: () => now,
    requestFrame: (callback) => {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
  };
  return {
    scheduler,
    get now() {
      return now;
    },
    get pending() {
      return frames.size;
    },
    advance(ms: number): void {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) {
        callback(now);
      }
    },
  };
}

describe('startRewind', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('rewinds one media second per wall-clock second at 1×', () => {
    const video = stubVideo({ currentTime: 10, duration: 60 });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, { scheduler: clock.scheduler });
    expect(session).not.toBeNull();
    clock.advance(0);
    expect(video.currentTime).toBe(10);
    clock.advance(1000);
    expect(video.currentTime).toBe(9);
    session?.stop();
  });

  it('scales velocity with the magnitude and does not accumulate callback drift', () => {
    const video = stubVideo({ currentTime: 20, duration: 60 });
    const clock = createFakeScheduler();
    const session = startRewind(video, 2, { scheduler: clock.scheduler });
    expect(session).not.toBeNull();
    clock.advance(0);
    // Extra frames in the same elapsed second must not overshoot 2s.
    for (let index = 0; index < 20; index += 1) {
      clock.advance(50);
    }
    expect(video.currentTime).toBe(18);
    session?.stop();
  });

  it('throttles seek writes to the configured ceiling', () => {
    const video = stubVideo({ currentTime: 30, duration: 60 });
    const writes: number[] = [];
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => writes.at(-1) ?? 30,
      set: (value: number) => {
        writes.push(value);
      },
    });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, {
      scheduler: clock.scheduler,
      maxSeeksPerSecond: REWIND_SEEKS_PER_SECOND,
    });
    expect(session).not.toBeNull();
    clock.advance(0);
    for (let index = 0; index < 60; index += 1) {
      clock.advance(1000 / 60);
    }
    expect(writes.length).toBeLessThanOrEqual(REWIND_SEEKS_PER_SECOND);
    expect(writes.length).toBeGreaterThan(0);
    session?.stop();
  });

  it('skips writes while the video is seeking', () => {
    const video = stubVideo({ currentTime: 12, duration: 60, seeking: true });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, { scheduler: clock.scheduler });
    clock.advance(0);
    clock.advance(1000);
    expect(video.currentTime).toBe(12);
    Object.defineProperty(video, 'seeking', {
      configurable: true,
      get: () => false,
    });
    clock.advance(0);
    expect(video.currentTime).toBe(11);
    session?.stop();
  });

  it('clamps to zero and to a non-zero seekable floor', () => {
    const plain = stubVideo({ currentTime: 0.2, duration: 60 });
    const plainClock = createFakeScheduler();
    const plainSession = startRewind(plain, 1, { scheduler: plainClock.scheduler });
    plainClock.advance(0);
    plainClock.advance(1000);
    expect(plain.currentTime).toBe(0);
    expect(plainClock.pending).toBe(0);
    plainSession?.stop();

    const dvr = stubVideo({
      currentTime: 32,
      duration: 120,
      seekable: [{ start: 30, end: 90 }],
    });
    const dvrClock = createFakeScheduler();
    const dvrSession = startRewind(dvr, 1, { scheduler: dvrClock.scheduler });
    dvrClock.advance(0);
    dvrClock.advance(5000);
    expect(dvr.currentTime).toBe(30);
    expect(dvrClock.pending).toBe(0);
    dvrSession?.stop();
  });

  it('never seeks forward after an external backward jump', () => {
    const video = stubVideo({ currentTime: 20, duration: 60 });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, { scheduler: clock.scheduler });
    clock.advance(0);
    clock.advance(500);
    expect(video.currentTime).toBe(19.5);
    video.currentTime = 8;
    clock.advance(500);
    // Theoretical is still ~19. Stay put rather than jumping forward.
    expect(video.currentTime).toBe(8);
    session?.stop();
  });

  it('stops scheduling after a failed currentTime write', () => {
    const video = stubVideo({ currentTime: 10, duration: 60, seekThrows: true });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, { scheduler: clock.scheduler });
    clock.advance(0);
    clock.advance(1000);
    expect(video.currentTime).toBe(10);
    expect(clock.pending).toBe(0);
    session?.stop();
    session?.stop();
  });

  it('fails closed for a disconnected or unusable video', () => {
    const missing = stubVideo({ currentTime: 10, duration: 60 });
    missing.remove();
    expect(startRewind(missing, 1, { scheduler: createFakeScheduler().scheduler })).toBeNull();

    const unknown = stubVideo({ currentTime: Number.NaN, duration: 60 });
    expect(startRewind(unknown, 1, { scheduler: createFakeScheduler().scheduler })).toBeNull();

    const video = stubVideo({ currentTime: 10, duration: 60 });
    expect(startRewind(video, 0, { scheduler: createFakeScheduler().scheduler })).toBeNull();
    expect(startRewind(video, -1, { scheduler: createFakeScheduler().scheduler })).toBeNull();
    expect(
      startRewind(video, Number.NaN, { scheduler: createFakeScheduler().scheduler }),
    ).toBeNull();
  });

  it('stops mid-loop when the video is disconnected', () => {
    const video = stubVideo({ currentTime: 10, duration: 60 });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, { scheduler: clock.scheduler });
    clock.advance(0);
    clock.advance(200);
    video.remove();
    clock.advance(200);
    expect(clock.pending).toBe(0);
    session?.stop();
  });

  it('cancels the pending frame and is idempotent', () => {
    const video = stubVideo({ currentTime: 10, duration: 60 });
    const clock = createFakeScheduler();
    const session = startRewind(video, 1, { scheduler: clock.scheduler });
    expect(clock.pending).toBe(1);
    session?.stop();
    expect(clock.pending).toBe(0);
    session?.stop();
    clock.advance(1000);
    expect(video.currentTime).toBe(10);
  });
});
