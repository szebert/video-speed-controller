// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeControllerAction } from '../core/execute-controller-action';
import {
  canToggleVideoFullscreen,
  isVideoFullscreen,
  toggleVideoFullscreen,
} from '../core/media-fullscreen';
import { MediaRegistry } from '../core/media-registry';
import { HOTKEY_FLASH_HOST_TAG, OVERLAY_HOST_TAG } from '../core/video-overlay';
import { builtInEffectiveHotkeys } from '../settings/hotkey-binding';
import { tabBehavior } from './tab-behavior-fixture';

describe('video fullscreen', () => {
  const binding = { code: 'KeyF', ctrl: false, alt: false, shift: false, meta: false };
  const documentKeys = ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen'] as const;
  let saved: (PropertyDescriptor | undefined)[];
  let available: boolean;
  let fullscreen: Element | null;
  let video: HTMLVideoElement;
  let registry: MediaRegistry;
  const sendMessage = vi.fn();
  const request = vi.fn<() => Promise<void>>();
  const exit = vi.fn<() => Promise<void>>();

  function button(): HTMLButtonElement {
    return document
      .querySelector(OVERLAY_HOST_TAG)
      ?.shadowRoot?.querySelector('.fullscreen-toggle') as HTMLButtonElement;
  }

  function flashText(): string | null | undefined {
    return document
      .querySelector(HOTKEY_FLASH_HOST_TAG)
      ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent;
  }

  function press(): Promise<void> {
    return executeControllerAction('toggleFullscreen', {
      resolveRegistry: () => registry,
      source: { kind: 'hotkey', binding, video },
    });
  }

  beforeEach(() => {
    saved = documentKeys.map((key) => Object.getOwnPropertyDescriptor(document, key));
    available = true;
    fullscreen = null;
    Object.defineProperties(document, {
      fullscreenEnabled: { configurable: true, get: () => available },
      fullscreenElement: { configurable: true, get: () => fullscreen },
      exitFullscreen: { configurable: true, value: exit },
    });
    sendMessage.mockReset();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    video = document.createElement('video');
    video.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 160, bottom: 90, width: 160, height: 90 }) as DOMRect;
    document.body.append(video);
    request.mockReset().mockImplementation(async () => {
      fullscreen = video;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    exit.mockReset().mockImplementation(async () => {
      fullscreen = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    video.requestFullscreen = request;
    registry = new MediaRegistry(document, {
      adjustSpeed() {},
      mediaAction(action, phase, target) {
        void executeControllerAction(action, {
          resolveRegistry: () => registry,
          source: { kind: 'overlay', video: target },
          phase,
        });
      },
    });
    registry.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true, overlayHotkeyHints: true }),
      {
        ...builtInEffectiveHotkeys(),
        toggleFullscreen: binding,
      },
    );
    registry.ensureController(video);
  });

  afterEach(() => {
    registry.destroy();
    document.body.replaceChildren();
    documentKeys.forEach((key, index) => {
      const descriptor = saved[index];
      if (descriptor) {
        Object.defineProperty(document, key, descriptor);
      } else {
        Reflect.deleteProperty(document, key);
      }
    });
    vi.unstubAllGlobals();
  });

  it('places fullscreen immediately after loop and dispatches its button locally', async () => {
    const control = button();
    expect(control.previousElementSibling?.getAttribute('aria-label')).toBe('Loop');
    expect(control.disabled).toBe(false);
    expect(control.querySelector('.hotkey-hint')?.textContent).toBe('F');
    control.click();
    expect(request).toHaveBeenCalledTimes(1);
    // The registry's production callback awaits the fullscreen promise.
    await vi.waitFor(() => expect(flashText()).toBe('Fullscreen on'));
    expect(control.getAttribute('aria-label')).toBe('Fullscreen off');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('toggles from the initial keydown stack and flashes only its target', async () => {
    const overlay = registry.getOverlay(video);
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('visible');
    const action = press();
    expect(request).toHaveBeenCalledTimes(1);
    await action;
    expect(flashText()).toBe('Fullscreen on');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('hidden');
    await press();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(flashText()).toBe('Fullscreen off');
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('visible');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('disables a policy-blocked button but still flashes a hotkey failure', async () => {
    available = false;
    document.dispatchEvent(new Event('fullscreenerror'));
    expect(button().disabled).toBe(true);
    button().click();
    expect(request).not.toHaveBeenCalled();
    await press();
    expect(request).not.toHaveBeenCalled();
    expect(flashText()).toBe('Fullscreen unavailable for this video');
    expect(
      document.querySelector(HOTKEY_FLASH_HOST_TAG)?.shadowRoot?.querySelector('.hotkey-hint')
        ?.textContent,
    ).toBe('F');
  });

  it('rejects unsupported or disconnected videos before attempting fullscreen', async () => {
    Object.defineProperty(video, 'requestFullscreen', { configurable: true, value: undefined });
    expect(canToggleVideoFullscreen(video)).toBe(false);
    expect(await toggleVideoFullscreen(video)).toBe('unavailable');
    video.requestFullscreen = request;
    video.remove();
    expect(await toggleVideoFullscreen(video)).toBe('unavailable');
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['throw', 'reject'] as const)(
    'flashes a runtime failure when entry requests %s',
    async (failure) => {
      request.mockImplementation(() => {
        if (failure === 'throw') {
          throw new TypeError('Fullscreen denied');
        }
        return Promise.reject(new TypeError('Fullscreen denied'));
      });
      await expect(press()).resolves.toBeUndefined();
      expect(flashText()).toBe('Could not change fullscreen for this video');
      expect(fullscreen).toBeNull();
    },
  );

  it('allows exit even if entry becomes unavailable, and catches exit failures', async () => {
    fullscreen = video;
    available = false;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(button().disabled).toBe(false);
    exit.mockRejectedValue(new TypeError('Cannot exit'));
    await press();
    expect(flashText()).toBe('Could not change fullscreen for this video');
  });

  it('tracks native fullscreen changes and wrapper fullscreen without targeting another video', async () => {
    const wrapper = document.createElement('div');
    document.body.append(wrapper);
    wrapper.append(video);
    fullscreen = wrapper;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(button().getAttribute('aria-label')).toBe('Fullscreen off');
    expect(isVideoFullscreen(video)).toBe(true);
    await press();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-label')).toBe('Fullscreen on');
    const other = document.createElement('video');
    document.body.append(other);
    fullscreen = other;
    expect(isVideoFullscreen(video)).toBe(false);
    await press();
    expect(request).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('detects a fullscreen video inside shadow DOM and a wrapper across shadow boundaries', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    shadow.append(video);
    fullscreen = host;
    Object.defineProperty(shadow, 'fullscreenElement', { configurable: true, value: video });
    expect(isVideoFullscreen(video)).toBe(true);
    Object.defineProperty(shadow, 'fullscreenElement', { configurable: true, value: null });
    expect(isVideoFullscreen(video)).toBe(true);
  });

  it('prevents overlapping requests and permits retry when a request settles', async () => {
    let resolve: (() => void) | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const first = toggleVideoFullscreen(video);
    expect(await toggleVideoFullscreen(video)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    resolve?.();
    await first;
    expect(await toggleVideoFullscreen(video)).toBe('entered');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
