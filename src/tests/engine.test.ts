// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInAppliedTabBehavior } from '../core/applied-tab-behavior';
import { destroyEngine, getActiveEngine, startEngine } from '../core/video-speed-engine';
import { builtInEffectiveHotkeys } from '../settings/hotkey-binding';

describe('engine lifecycle', () => {
  afterEach(() => {
    destroyEngine();
    document.body.replaceChildren();
    document.documentElement.querySelectorAll('osvsc-overlay').forEach((node) => node.remove());
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it('does not dispatch compiled-in hotkeys until APPLY includes a map', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, targetSpeed: 1 }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const engine = startEngine();
    engine.setBehavior(builtInAppliedTabBehavior(2));
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'BracketLeft',
        key: '[',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
    engine.setBehavior(builtInAppliedTabBehavior(2), builtInEffectiveHotkeys());
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'BracketLeft',
        key: '[',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DISPATCH_TAB_ACTION',
      action: 'decreaseSpeed',
    });
  });

  it('does not retake a surrendered video when APPLY repeats the same target with new hotkeys', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    document.body.append(video);
    const engine = startEngine();
    engine.setBehavior(builtInAppliedTabBehavior(3), builtInEffectiveHotkeys());
    const controller = engine.registry.ensureController(video);
    video.playbackRate = 1.5;
    video.dispatchEvent(new Event('ratechange'));
    for (let index = 0; index < 4; index += 1) {
      vi.runOnlyPendingTimers();
      video.playbackRate = 1.5;
      video.dispatchEvent(new Event('ratechange'));
    }
    expect(controller.surrendered).toBe(true);

    engine.setBehavior(builtInAppliedTabBehavior(3), {
      ...builtInEffectiveHotkeys(),
      increaseSpeed: {
        code: 'KeyL',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
    });
    expect(controller.surrendered).toBe(true);
    expect(video.playbackRate).toBe(1.5);
  });
});
