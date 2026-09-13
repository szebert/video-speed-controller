// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeControllerAction } from '../core/execute-controller-action';
import { MediaRegistry } from '../core/media-registry';
import { destroyEngine, getActiveEngine, startEngine } from '../core/video-speed-engine';
import { HOTKEY_FLASH_HOST_TAG } from '../core/video-overlay';
import { BUILT_IN_HOTKEYS } from '../settings/hotkey-binding';
import { tabBehavior } from './tab-behavior-fixture';

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

  it('does not flash overlay-originated actions', async () => {
    await executeControllerAction('increaseSpeed', {
      resolveRegistry: () => registry,
      source: { kind: 'overlay', video },
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
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
