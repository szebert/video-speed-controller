// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeControllerAction } from '../core/execute-controller-action';
import { MediaRegistry } from '../core/media-registry';
import { destroyEngine, getActiveEngine, startEngine } from '../core/video-speed-engine';
import { HOTKEY_FLASH_HOST_TAG } from '../core/video-overlay';
import { BUILT_IN_HOTKEYS } from '../settings/hotkey-binding';
import { tabBehavior } from './tab-behavior-fixture';

/** Gives a jsdom video a working timeline, playback state, and rate. */
function seekable(
  video: HTMLVideoElement,
  options: { currentTime: number; duration: number; paused?: boolean; playbackRate?: number },
): void {
  let currentTime = options.currentTime;
  let paused = options.paused ?? false;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => options.duration,
  });
  Object.defineProperty(video, 'paused', {
    configurable: true,
    get: () => paused,
  });
  vi.spyOn(video, 'play').mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  vi.spyOn(video, 'pause').mockImplementation(() => {
    paused = true;
  });
  if (options.playbackRate != null) {
    video.playbackRate = options.playbackRate;
  }
}

function flashText(): string | null | undefined {
  return document
    .querySelector(HOTKEY_FLASH_HOST_TAG)
    ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent;
}

describe('executeControllerAction', () => {
  const sendMessage = vi.fn();
  let registry: MediaRegistry;
  let video: HTMLVideoElement;

  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({
      ok: true,
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    registry = new MediaRegistry(document);
    video = document.createElement('video');
    video.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 160,
        height: 90,
        right: 160,
        bottom: 90,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      }) as DOMRect;
    document.body.append(video);
    registry.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    registry.ensureController(video);
  });

  afterEach(() => {
    destroyEngine();
    registry.destroy();
    document.body.replaceChildren();
    document.documentElement
      .querySelectorAll(HOTKEY_FLASH_HOST_TAG)
      .forEach((node) => node.remove());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('flashes after a successful hotkey dispatch using the snapshot binding', async () => {
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed },
    });
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.25× (+0.25×)',
    );
    expect(host?.shadowRoot?.querySelector('.hotkey-hint')?.textContent).toBe(']');
  });

  it('does not flash overlay-originated actions when button flash is off', async () => {
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => registry,
      source: { kind: 'overlay', video },
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('flashes overlay-originated speed actions when button flash is on', async () => {
    registry.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: true }));
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => registry,
      source: { kind: 'overlay', video },
    });
    expect(flashText()).toBe('1.25× (+0.25×)');
  });

  it('does not flash when dispatch fails', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Missing tab' });
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed },
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('lets the registry gate a disabled flash setting', async () => {
    registry.setBehavior(tabBehavior(1, { overlayAutoHide: false, hotkeyFlash: false }));
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed },
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('rejects when chrome.runtime.sendMessage rejects', async () => {
    sendMessage.mockRejectedValue(new Error('Extension context invalidated'));
    await expect(
      executeControllerAction('increaseSpeed', {
        resolveRegistry: () => registry,
        source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed },
      }),
    ).rejects.toThrow('Extension context invalidated');
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('routes media navigation locally instead of through DISPATCH_TAB_ACTION', async () => {
    seekable(video, { currentTime: 30, duration: 120 });
    await executeControllerAction('skipForward', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video },
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(40);
    expect(flashText()).toBe('Skip forward 10s');
  });

  it('skips back and forward by their own configured distances', async () => {
    seekable(video, { currentTime: 30, duration: 120 });
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('skipBack', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(25);
    expect(flashText()).toBe('Skip back 5s');

    registry.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        skipBackSeconds: 15,
        skipForwardSeconds: 45,
      }),
    );
    await executeControllerAction('skipForward', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(70);
    await executeControllerAction('skipBack', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(55);
  });

  it('scales skips by the video rate only when the setting is on', async () => {
    seekable(video, { currentTime: 100, duration: 600, playbackRate: 2 });
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('skipForward', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(110);

    registry.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, skipScaleWithPlaybackRate: true }),
    );
    await executeControllerAction('skipForward', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(130);
    expect(flashText()).toBe('Skip forward 20s');
  });

  it('reports the clamped distance a skip actually travelled', async () => {
    seekable(video, { currentTime: 118, duration: 120 });
    await executeControllerAction('skipForward', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video },
    });
    expect(video.currentTime).toBe(120);
    expect(flashText()).toBe('Skip forward 2s');
  });

  it('jumps to the start, and only jumps to a finite end', async () => {
    seekable(video, { currentTime: 40, duration: 120 });
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('jumpToStart', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(0);
    expect(flashText()).toBe('Jump to start');

    await executeControllerAction('jumpToEnd', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(120);
    expect(flashText()).toBe('Jump to end');

    const live = document.createElement('video');
    live.getBoundingClientRect = video.getBoundingClientRect;
    document.body.append(live);
    registry.ensureController(live);
    seekable(live, { currentTime: 500, duration: Number.POSITIVE_INFINITY });
    await executeControllerAction('jumpToEnd', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video: live },
    });
    expect(live.currentTime).toBe(500);
  });

  it('toggles playback and reports the direction it went', async () => {
    seekable(video, { currentTime: 10, duration: 120, paused: true });
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('playPause', { resolveRegistry: () => registry, source });
    expect(video.paused).toBe(false);
    expect(flashText()).toBe('Play');

    await executeControllerAction('playPause', { resolveRegistry: () => registry, source });
    expect(video.paused).toBe(true);
    expect(flashText()).toBe('Pause');
  });

  it('does nothing at all for rewind', async () => {
    seekable(video, { currentTime: 30, duration: 120 });
    for (const phase of ['press', 'start', 'end'] as const) {
      await executeControllerAction('rewind', {
        resolveRegistry: () => registry,
        source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video },
        phase,
        hold: {},
      });
    }
    expect(sendMessage).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('holds the fast forward rate between start and end', async () => {
    seekable(video, { currentTime: 10, duration: 120, paused: true });
    registry.setBehavior(tabBehavior(1.5, { overlayAutoHide: false }));
    const hold = {};
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'start',
      hold,
    });
    expect(video.playbackRate).toBe(3);
    expect(video.paused).toBe(false);
    expect(flashText()).toBe('Fast forward 3.00×');

    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'end',
      hold,
    });
    expect(video.playbackRate).toBe(1.5);
    expect(video.paused).toBe(true);
  });

  it('keeps the fast forward flash for the whole hold, then uses the delay', async () => {
    vi.useFakeTimers();
    seekable(video, { currentTime: 10, duration: 120, paused: false });
    registry.setBehavior(tabBehavior(1.5, { overlayAutoHide: false, flashDelayMs: 200 }));
    const hold = {};
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'start',
      hold,
    });
    expect(flashText()).toBe('Fast forward 3.00×');
    vi.advanceTimersByTime(1_000);
    expect(flashText()).toBe('Fast forward 3.00×');

    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'end',
      hold,
    });
    expect(flashText()).toBe('Fast forward 3.00×');
    vi.advanceTimersByTime(199);
    expect(flashText()).toBe('Fast forward 3.00×');
    vi.advanceTimersByTime(1);
    expect(flashText()).toBeUndefined();
    vi.useRealTimers();
  });

  it('does not hide a held flash when a replaced owner ends', async () => {
    vi.useFakeTimers();
    seekable(video, { currentTime: 10, duration: 120, paused: false });
    registry.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    const first = {};
    const second = {};
    const hotkey = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    const overlay = { kind: 'overlay', video } as const;
    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source: hotkey,
      phase: 'start',
      hold: first,
    });
    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source: overlay,
      phase: 'start',
      hold: second,
    });
    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source: hotkey,
      phase: 'end',
      hold: first,
    });
    vi.advanceTimersByTime(1_000);
    expect(flashText()).toBe('Fast forward 3.00×');
    expect(video.playbackRate).toBe(3);

    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source: overlay,
      phase: 'end',
      hold: second,
    });
    vi.advanceTimersByTime(200);
    expect(flashText()).toBeUndefined();
    expect(video.playbackRate).toBe(1);
    vi.useRealTimers();
  });

  it('ignores a fast forward end from a replaced hold owner', async () => {
    seekable(video, { currentTime: 10, duration: 120, paused: false });
    const source = { kind: 'overlay', video } as const;
    const first = {};
    const second = {};
    for (const hold of [first, second]) {
      await executeControllerAction('fastForward', {
        resolveRegistry: () => registry,
        source,
        phase: 'start',
        hold,
      });
    }
    expect(video.playbackRate).toBe(3);

    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'end',
      hold: first,
    });
    expect(video.playbackRate).toBe(3);

    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'end',
      hold: second,
    });
    expect(video.playbackRate).toBe(1);
  });

  it('does not flash overlay-originated navigation when button flash is off', async () => {
    seekable(video, { currentTime: 30, duration: 120 });
    await executeControllerAction('skipForward', {
      resolveRegistry: () => registry,
      source: { kind: 'overlay', video },
    });
    expect(video.currentTime).toBe(40);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('flashes overlay-originated navigation when button flash is on', async () => {
    seekable(video, { currentTime: 30, duration: 120 });
    registry.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: true }));
    await executeControllerAction('skipForward', {
      resolveRegistry: () => registry,
      source: { kind: 'overlay', video },
    });
    expect(video.currentTime).toBe(40);
    expect(flashText()).toBe('Skip forward 10s');
  });

  it('does not skip a disconnected video, but still ends a fast forward hold', async () => {
    seekable(video, { currentTime: 30, duration: 120, paused: false });
    registry.setBehavior(tabBehavior(1.5, { overlayAutoHide: false }));
    const hold = {};
    const source = { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video } as const;
    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'start',
      hold,
    });
    expect(video.playbackRate).toBe(3);

    video.remove();
    await executeControllerAction('skipForward', { resolveRegistry: () => registry, source });
    expect(video.currentTime).toBe(30);

    await executeControllerAction('fastForward', {
      resolveRegistry: () => registry,
      source,
      phase: 'end',
      hold,
    });
    expect(video.playbackRate).toBe(1.5);
  });

  it('does nothing when navigation has no resolved target', async () => {
    await executeControllerAction('skipForward', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed, video: null },
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('flashes the active engine when the pre-dispatch registry was destroyed', async () => {
    registry.destroy();
    const engine = startEngine();
    engine.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    const liveVideo = document.createElement('video');
    liveVideo.getBoundingClientRect = video.getBoundingClientRect;
    document.body.append(liveVideo);
    engine.registry.ensureController(liveVideo);
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => getActiveEngine()?.registry ?? registry,
      source: { kind: 'hotkey', binding: BUILT_IN_HOTKEYS.increaseSpeed },
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
  });
});
