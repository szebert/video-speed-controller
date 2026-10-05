// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetBehaviorSettingsResponse } from '../protocol/schemas/options-background';
import type { BehaviorSettingsSnapshot } from '../protocol/schemas/shared';
import { OVERLAY_POSITION, resolveSiteBehavior } from '../settings/site-behavior';
import { OptionsController } from '../entrypoints/options/options-controller';

function snapshot(): BehaviorSettingsSnapshot {
  const { hotkeys, ...global } = resolveSiteBehavior();
  return {
    global,
    globalHotkeys: hotkeys,
    site: null,
  };
}

function siteSnapshot(hostname: string): BehaviorSettingsSnapshot {
  const base = snapshot();
  return {
    ...base,
    site: {
      hostname,
      behavior: { ...base.global },
      hotkeys: base.globalHotkeys,
      speedOverrideKind: 'missing',
      defaultSpeedOverrideKind: 'missing',
      seedTarget: base.global.speed.value,
    },
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

describe('OptionsController first write', () => {
  const sendMessage = vi.fn();
  let controller: OptionsController | null = null;

  beforeEach(() => {
    sendMessage.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('chrome-extension://extid/options.html'),
    });
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
    controller?.destroy();
    controller = null;
    vi.unstubAllGlobals();
  });

  it('persists the first mutation on the first usable state', async () => {
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

    controller = new OptionsController();
    let wrote = false;
    controller.subscribe(() => {
      const state = controller?.getState();
      if (!controller || wrote || !state?.ready || !state.behavior) {
        return;
      }
      wrote = true;
      controller.mutate({
        kind: 'value',
        field: 'overlayPosition',
        value: OVERLAY_POSITION.BOTTOM_LEFT,
      });
    });
    controller.start();
    expect(controller.getState().ready).toBe(false);
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'GET_BEHAVIOR_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);

    settingsLoad.resolve(getOk(snapshot()));
    await settingsLoad.promise;
    await vi.waitFor(() => {
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

  it('does not send a queued site edit after that site is deleted', async () => {
    const site = siteSnapshot('example.com');
    const gate = deferred<void>();
    sendMessage.mockImplementation(
      async (message: { type?: string; change?: { field?: string } }) => {
        if (message.type === 'GET_CUSTOM_SITES') {
          return { ok: true, customSites: [] };
        }
        if (message.type === 'GET_BEHAVIOR_SETTINGS') {
          return getOk(site);
        }
        if (message.type === 'SET_BEHAVIOR_SETTING' && message.change?.field === 'speed') {
          await gate.promise;
        }
        return {
          ok: true,
          state: snapshot(),
          reappliedTabs: 0,
          reapplyFailures: 0,
        };
      },
    );
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('chrome-extension://extid/options.html?site=example.com'),
    });
    controller = new OptionsController();
    controller.start();
    await vi.waitFor(() => {
      expect(controller?.getState().ready).toBe(true);
    });
    controller.mutate({ kind: 'value', field: 'speed', value: 1.5 });
    await vi.waitFor(() => {
      expect(sendMessage.mock.calls.some((call) => call[0]?.type === 'SET_BEHAVIOR_SETTING')).toBe(
        true,
      );
    });
    controller.mutate({ kind: 'value', field: 'overlayVisible', value: false });
    const deleting = controller.deleteSite('example.com');
    gate.resolve();
    await deleting;
    expect(
      sendMessage.mock.calls.some(
        (call) =>
          call[0]?.type === 'SET_BEHAVIOR_SETTING' && call[0]?.change?.field === 'overlayVisible',
      ),
    ).toBe(false);
    expect(sendMessage.mock.calls.some((call) => call[0]?.type === 'DELETE_SITE_SETTINGS')).toBe(
      true,
    );
  });
});
