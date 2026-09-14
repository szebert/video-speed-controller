// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeControllerAction } from '../core/execute-controller-action';
import { HotkeyListener } from '../core/hotkey-listener';
import { MediaRegistry } from '../core/media-registry';
import {
  builtInEffectiveHotkeys,
  type EffectiveHotkeyMap,
  type HotkeyBinding,
} from '../settings/hotkey-binding';

vi.mock('../core/execute-controller-action', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/execute-controller-action')>();
  return {
    ...actual,
    executeControllerAction: vi.fn((...args: Parameters<typeof actual.executeControllerAction>) =>
      actual.executeControllerAction(...args),
    ),
  };
});

const executeMock = vi.mocked(executeControllerAction);

function keydown(code: string, extras: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    code,
    key: extras.key ?? code,
    bubbles: true,
    cancelable: true,
    ...extras,
  });
}

function keyup(code: string, extras: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keyup', {
    code,
    key: extras.key ?? code,
    bubbles: true,
    cancelable: true,
    ...extras,
  });
}

function binding(code: string): HotkeyBinding {
  return { code, ctrl: false, alt: false, shift: false, meta: false };
}

/** Navigation actions have no built-in bindings, so tests assign their own. */
function navigationMap(): EffectiveHotkeyMap {
  return {
    ...builtInEffectiveHotkeys(),
    rewind: binding('KeyH'),
    skipBack: binding('KeyJ'),
    skipForward: binding('KeyK'),
    fastForward: binding('KeyL'),
  };
}

function navigationCalls(): Array<[string, string | undefined]> {
  return executeMock.mock.calls.map(([action, context]) => [action, context.phase]);
}

describe('HotkeyListener', () => {
  const sendMessage = vi.fn();
  let registry: MediaRegistry;
  let listener: HotkeyListener;

  beforeEach(() => {
    vi.useFakeTimers();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ ok: true, previousTargetSpeed: 1, targetSpeed: 1.25 });
    executeMock.mockClear();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    registry = new MediaRegistry(document);
    listener = new HotkeyListener(window, () => registry);
  });

  afterEach(() => {
    listener.destroy();
    registry.destroy();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function enableRepeat(delayMs = 500, rate = 15): void {
    listener.setRepeatPolicy({ enabled: true, delayMs, rate });
  }

  it('stays inert until a map is applied and ignores key repeat', () => {
    window.dispatchEvent(keydown('BracketLeft', { key: '[' }));
    expect(sendMessage).not.toHaveBeenCalled();

    listener.setHotkeys(builtInEffectiveHotkeys());
    window.dispatchEvent(keydown('BracketLeft', { key: '[' }));
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DISPATCH_TAB_ACTION',
      action: 'decreaseSpeed',
    });

    sendMessage.mockClear();
    window.dispatchEvent(keydown('BracketLeft', { key: '[', repeat: true }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not start timers for Reset when repeat is enabled', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('Backslash', { key: '\\' }));
    await vi.runAllTimersAsync();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DISPATCH_TAB_ACTION',
      action: 'resetSpeed',
    });
  });

  it('fires the first repeat after the delay, not delay plus interval', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(66);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('starts the repeat phase at the delay even if the initial dispatch is still in flight', async () => {
    const pending: Array<(value: unknown) => void> = [];
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    pending.shift()?.({ ok: true, previousTargetSpeed: 1, targetSpeed: 1.25 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(66);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('cancels Faster when Reset is pressed and does not keep repeating', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    window.dispatchEvent(keydown('Backslash', { key: '\\' }));
    expect(sendMessage.mock.calls.at(-1)?.[0]).toEqual({
      type: 'DISPATCH_TAB_ACTION',
      action: 'resetSpeed',
    });
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('cancels on keyup without consuming the event', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    const up = keyup('BracketRight', { key: ']' });
    const prevented = vi.fn();
    up.preventDefault = prevented;
    window.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(false);
    expect(prevented).not.toHaveBeenCalled();
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('cancels when a required modifier is released', async () => {
    listener.setHotkeys({
      ...builtInEffectiveHotkeys(),
      increaseSpeed: {
        code: 'BracketRight',
        ctrl: false,
        alt: false,
        shift: true,
        meta: false,
      },
    });
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']', shiftKey: true }));
    window.dispatchEvent(keyup('ShiftLeft', { key: 'Shift', shiftKey: false }));
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('cancels on blur and destroy', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    window.dispatchEvent(new Event('blur'));
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();

    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    listener.destroy();
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('skips ticks while that hold is in flight', async () => {
    const pending: Array<(value: unknown) => void> = [];
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    pending.shift()?.({ ok: true, previousTargetSpeed: 1, targetSpeed: 1.25 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(67);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale Faster completion clear a newer Slower hold', async () => {
    const pending: Array<(value: unknown) => void> = [];
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    expect(sendMessage.mock.calls[0]?.[0]).toEqual({
      type: 'DISPATCH_TAB_ACTION',
      action: 'increaseSpeed',
    });
    window.dispatchEvent(keydown('BracketLeft', { key: '[' }));
    expect(sendMessage.mock.calls[1]?.[0]).toEqual({
      type: 'DISPATCH_TAB_ACTION',
      action: 'decreaseSpeed',
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    pending.shift()?.({ ok: true, previousTargetSpeed: 1, targetSpeed: 1.25 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    pending.shift()?.({ ok: true, previousTargetSpeed: 1.25, targetSpeed: 1 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage.mock.calls[2]?.[0]).toEqual({
      type: 'DISPATCH_TAB_ACTION',
      action: 'decreaseSpeed',
    });
  });

  it('does not resume Faster after Slower replaces it', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    window.dispatchEvent(keydown('BracketLeft', { key: '[' }));
    sendMessage.mockClear();
    window.dispatchEvent(keyup('BracketLeft', { key: '[' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('cancels only the rejected generation', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    executeMock.mockRejectedValueOnce(new Error('gone'));
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    await Promise.resolve();
    sendMessage.mockClear();
    executeMock.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();

    executeMock.mockRejectedValueOnce(new Error('stale'));
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    window.dispatchEvent(keydown('BracketLeft', { key: '[' }));
    await Promise.resolve();
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DISPATCH_TAB_ACTION',
      action: 'decreaseSpeed',
    });
  });

  it('cancels the hold when chrome.runtime.sendMessage rejects', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    sendMessage.mockRejectedValue(new Error('Extension context invalidated'));
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    await expect(executeMock.mock.results[0]?.value).rejects.toThrow(
      'Extension context invalidated',
    );
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ ok: true, previousTargetSpeed: 1, targetSpeed: 1.25 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('cancels when the document becomes hidden', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('cancels when the held binding changes', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat();
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    listener.setHotkeys({
      ...builtInEffectiveHotkeys(),
      increaseSpeed: {
        code: 'KeyF',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
    });
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('runs skips once, or repeats them when repeat is enabled', async () => {
    listener.setHotkeys(navigationMap());
    window.dispatchEvent(keydown('KeyK'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(navigationCalls()).toEqual([['skipForward', 'press']]);

    executeMock.mockClear();
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('KeyJ'));
    expect(navigationCalls()).toEqual([['skipBack', 'press']]);
    await vi.advanceTimersByTimeAsync(567);
    expect(navigationCalls()).toEqual([
      ['skipBack', 'press'],
      ['skipBack', 'press'],
      ['skipBack', 'press'],
    ]);
    window.dispatchEvent(keyup('KeyJ'));
    executeMock.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(navigationCalls()).toEqual([]);
  });

  it('holds fast forward from keydown to keyup under the same owner', async () => {
    listener.setHotkeys(navigationMap());
    window.dispatchEvent(keydown('KeyL'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(navigationCalls()).toEqual([['fastForward', 'start']]);

    window.dispatchEvent(keyup('KeyL'));
    expect(navigationCalls()).toEqual([
      ['fastForward', 'start'],
      ['fastForward', 'end'],
    ]);
    const [start, end] = executeMock.mock.calls;
    expect(start?.[1].hold).toBeDefined();
    expect(end?.[1].hold).toBe(start?.[1].hold);
  });

  it('holds fast forward the same way when repeat is enabled', async () => {
    listener.setHotkeys(navigationMap());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('KeyL'));
    await vi.advanceTimersByTimeAsync(2000);
    window.dispatchEvent(keyup('KeyL'));
    expect(navigationCalls()).toEqual([
      ['fastForward', 'start'],
      ['fastForward', 'end'],
    ]);
  });

  it('ends a fast forward hold exactly once per teardown path', async () => {
    listener.setHotkeys(navigationMap());
    window.dispatchEvent(keydown('KeyL'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(keyup('KeyL'));
    expect(navigationCalls()).toEqual([
      ['fastForward', 'start'],
      ['fastForward', 'end'],
    ]);

    executeMock.mockClear();
    window.dispatchEvent(keydown('KeyL'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(navigationCalls()).toEqual([
      ['fastForward', 'start'],
      ['fastForward', 'end'],
    ]);

    executeMock.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    window.dispatchEvent(keydown('KeyL'));
    listener.destroy();
    expect(navigationCalls()).toEqual([
      ['fastForward', 'start'],
      ['fastForward', 'end'],
    ]);
  });

  it('ends a fast forward hold when another navigation key replaces it', () => {
    listener.setHotkeys(navigationMap());
    window.dispatchEvent(keydown('KeyL'));
    window.dispatchEvent(keydown('KeyK'));
    expect(navigationCalls()).toEqual([
      ['fastForward', 'start'],
      ['fastForward', 'end'],
      ['skipForward', 'press'],
    ]);
  });

  it('leaves a rewind key to the page because rewind cannot run yet', () => {
    listener.setHotkeys(navigationMap());
    const event = keydown('KeyH');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('locks the navigation target on the initial keydown', async () => {
    const first = document.createElement('video');
    const second = document.createElement('video');
    const resolve = vi
      .spyOn(registry, 'resolveHotkeyTarget')
      .mockReturnValueOnce(first)
      .mockReturnValue(second);
    listener.setHotkeys(navigationMap());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('KeyJ'));
    await vi.advanceTimersByTimeAsync(567);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(executeMock.mock.calls).toHaveLength(3);
    for (const [, context] of executeMock.mock.calls) {
      expect(context.source).toMatchObject({ kind: 'hotkey', video: first });
    }
  });

  it('does not consume a navigation key when the registry cannot resolve a target', () => {
    vi.spyOn(registry, 'resolveHotkeyTarget').mockReturnValue(null);
    listener.setHotkeys(navigationMap());
    window.dispatchEvent(keydown('KeyK'));
    expect(navigationCalls()).toEqual([['skipForward', 'press']]);
    expect(executeMock.mock.calls[0]?.[1].source).toMatchObject({ video: null });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not cancel a hold when the same repeat policy is applied again', async () => {
    listener.setHotkeys(builtInEffectiveHotkeys());
    enableRepeat(500, 15);
    window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    listener.setRepeatPolicy({ enabled: true, delayMs: 500, rate: 15 });
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DISPATCH_TAB_ACTION',
      action: 'increaseSpeed',
    });
  });
});
