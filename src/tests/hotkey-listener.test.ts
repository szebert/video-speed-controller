// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeyListener } from '../core/hotkey-listener';
import { MediaRegistry } from '../core/media-registry';
import { builtInEffectiveHotkeys } from '../settings/hotkey-binding';

describe('HotkeyListener', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ ok: true, targetSpeed: 1.25 });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays inert until a map is applied and ignores key repeat', () => {
    const registry = new MediaRegistry(document);
    const listener = new HotkeyListener(window, () => ({
      registry,
      source: { kind: 'hotkey' },
    }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'BracketLeft',
        key: '[',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(sendMessage).not.toHaveBeenCalled();

    listener.setHotkeys(builtInEffectiveHotkeys());
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

    sendMessage.mockClear();
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'BracketLeft',
        key: '[',
        bubbles: true,
        cancelable: true,
        repeat: true,
      }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
    listener.destroy();
    registry.destroy();
  });
});
