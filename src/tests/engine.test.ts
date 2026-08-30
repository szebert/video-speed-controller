// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { builtInAppliedTabBehavior } from '../core/applied-tab-behavior';
import { destroyEngine, getActiveEngine, startEngine } from '../core/video-speed-engine';

describe('engine lifecycle', () => {
  afterEach(() => {
    destroyEngine();
    document.body.replaceChildren();
    document.documentElement.querySelectorAll('osvsc-overlay').forEach((node) => node.remove());
  });

  it('is idempotent while active and restartable after destroy', () => {
    const first = startEngine();
    const second = startEngine();
    expect(second).toBe(first);
    expect(getActiveEngine()).toBe(first);

    expect(destroyEngine()).toBe(true);
    expect(getActiveEngine()).toBeUndefined();
    expect(globalThis.__OSVSC_ENGINE__).toBeUndefined();

    const third = startEngine();
    expect(third).not.toBe(first);
    expect(third.active).toBe(true);
  });

  it('restores the captured baseline when the engine is destroyed', () => {
    const video = document.createElement('video');
    video.playbackRate = 1.25;
    document.body.append(video);
    const engine = startEngine();
    engine.setBehavior(builtInAppliedTabBehavior(2.5));
    expect(video.playbackRate).toBe(2.5);

    expect(destroyEngine()).toBe(true);
    expect(video.playbackRate).toBe(1.25);
  });
});
