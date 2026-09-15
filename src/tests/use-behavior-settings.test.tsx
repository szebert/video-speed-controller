// SPDX-License-Identifier: GPL-3.0-only

import { act, useLayoutEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetBehaviorSettingsResponse } from '../protocol/schemas/options-background';
import type { BehaviorSettingsSnapshot } from '../protocol/schemas/shared';
import { OVERLAY_POSITION, resolveSiteBehavior } from '../settings/site-behavior';
import { useBehaviorSettings } from '../entrypoints/options/useBehaviorSettings';

function snapshot(): BehaviorSettingsSnapshot {
  const { hotkeys, ...global } = resolveSiteBehavior();
  return {
    global,
    globalHotkeys: hotkeys,
    site: null,
  };
}

function getOk(state: BehaviorSettingsSnapshot): GetBehaviorSettingsResponse {
  return { ok: true, state };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function FirstWriteProbe() {
  const settings = useBehaviorSettings();
  const wrote = useRef(false);
  useLayoutEffect(() => {
    if (wrote.current || !settings.ready || !settings.behavior) {
      return;
    }
    wrote.current = true;
    settings.mutate({
      kind: 'value',
      field: 'overlayPosition',
      value: OVERLAY_POSITION.BOTTOM_LEFT,
    });
  }, [settings]);
  return settings.ready ? <div data-ready /> : <div data-loading />;
}

describe('useBehaviorSettings first write', () => {
  let root: Root | null = null;
  let container: HTMLElement;
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('chrome-extension://extid/options.html'),
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        sync: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      toast.dismiss();
      root?.unmount();
    });
    root = null;
    container?.remove();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('persists the first mutation on the first usable render', async () => {
    const settingsLoad = deferred<GetBehaviorSettingsResponse>();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return settingsLoad.promise;
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });

    await act(async () => {
      root?.render(<FirstWriteProbe />);
    });
    expect(container.querySelector('[data-loading]')).toBeTruthy();
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'GET_BEHAVIOR_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);

    await act(async () => {
      settingsLoad.resolve(getOk(snapshot()));
      await settingsLoad.promise;
    });

    expect(container.querySelector('[data-ready]')).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: {
        kind: 'value',
        field: 'overlayPosition',
        value: OVERLAY_POSITION.BOTTOM_LEFT,
      },
    });
  });
});
