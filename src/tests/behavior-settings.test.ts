// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSiteBehaviorSettings,
  getBehaviorSettings,
  getCustomSites,
  resetAllBehaviorSettings,
  resetGlobalBehaviorSettings,
  setBehaviorSetting,
} from '../background/behavior-settings';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import {
  persistGlobalBehaviorChange,
  resetBehaviorDefaultsRepairBackoff,
} from '../storage/behavior-defaults';
import { persistSiteSpeed, resetSiteRepairBackoff } from '../storage/site-settings';
import * as siteSettings from '../storage/site-settings';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { resetTabMutationQueue } from '../background/tab-mutation-queue';
import { memoryDurable } from './memory-store';

const EXTENSION_ORIGIN = 'chrome-extension://extid';

function extensionSender(url = `${EXTENSION_ORIGIN}/options.html`): chrome.runtime.MessageSender {
  return { url };
}

function stores() {
  return {
    sync: memoryDurable(),
    local: memoryDurable(),
    now: () => 1_000,
  };
}

describe('behavior settings API', () => {
  beforeEach(() => {
    resetBehaviorDefaultsRepairBackoff();
    resetSiteRepairBackoff();
    resetStorageMutationQueue();
    resetTabMutationQueue();
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `${EXTENSION_ORIGIN}${path === '/' ? '/' : path}`,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects web content senders', async () => {
    await expect(
      getBehaviorSettings({ type: 'GET_BEHAVIOR_SETTINGS' }, { url: 'https://example.com/' }),
    ).resolves.toEqual({ ok: false, error: 'Unauthorized' });
    await expect(getCustomSites({ url: 'https://example.com/' })).resolves.toEqual({
      ok: false,
      error: 'Unauthorized',
    });
    await expect(
      setBehaviorSetting(
        {
          type: 'SET_BEHAVIOR_SETTING',
          scope: { kind: 'global' },
          change: { kind: 'value', field: 'speed', value: 1.5 },
        },
        { url: 'https://example.com/' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns a global-only snapshot when hostname is omitted', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistGlobalBehaviorChange({ kind: 'value', field: 'speed', value: 1.5 }, deps);
    const response = await getBehaviorSettings(
      { type: 'GET_BEHAVIOR_SETTINGS' },
      extensionSender(),
      deps,
    );
    expect(response).toMatchObject({
      ok: true,
      state: {
        global: { speed: { value: 1.5, source: 'global' } },
        site: null,
      },
    });
  });

  it('rejects an invalid GET hostname instead of omitting it', async () => {
    await expect(
      getBehaviorSettings(
        { type: 'GET_BEHAVIOR_SETTINGS', hostname: 'example.com:8080' },
        extensionSender(),
      ),
    ).resolves.toEqual({ ok: false, error: 'Invalid hostname' });
  });

  it('rejects an invalid SET snapshotHostname instead of omitting it', async () => {
    await expect(
      setBehaviorSetting(
        {
          type: 'SET_BEHAVIOR_SETTING',
          scope: { kind: 'global' },
          change: { kind: 'value', field: 'overlayAutoHide', value: false },
          snapshotHostname: 'https://example.com',
        },
        extensionSender(),
        { ...stores(), listTabIds: async () => [] },
      ),
    ).resolves.toEqual({ ok: false, error: 'Invalid hostname' });
  });

  it('does not bump site LRU when Options reads a snapshot', async () => {
    const deps = { ...stores(), now: () => 1_000 };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    const record = deps.local.data['site:www.youtube.com'] as { lastUsedAt: number };
    expect(record.lastUsedAt).toBe(1_000);
    const later = { ...deps, now: () => 1_000 + 120_000, listTabIds: async () => [] };
    await getBehaviorSettings(
      { type: 'GET_BEHAVIOR_SETTINGS', hostname: 'www.youtube.com' },
      extensionSender(),
      later,
    );
    expect((later.local.data['site:www.youtube.com'] as { lastUsedAt: number }).lastUsedAt).toBe(
      1_000,
    );
  });

  it('returns re-resolved site behavior after a global SET with snapshotHostname', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_RIGHT },
        snapshotHostname: 'www.youtube.com',
      },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || !response.state) {
      throw new Error('expected a snapshot');
    }
    expect(response).not.toHaveProperty('siteMembership');
    expect(response.state.site).toEqual({
      hostname: 'www.youtube.com',
      behavior: expect.objectContaining({
        speed: { value: 1.25, source: 'site' },
        overlayPosition: { value: OVERLAY_POSITION.BOTTOM_RIGHT, source: 'global' },
      }),
    });
  });

  it('does not reapply when persist fails', async () => {
    const listTabIds = vi.fn(async () => {
      throw new Error('should not list tabs');
    });
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      },
      extensionSender(),
      {
        local: memoryDurable(),
        sync: {
          ...memoryDurable(),
          async set() {
            throw new Error('quota');
          },
        },
        listTabIds,
      },
    );
    expect(response).toEqual({ ok: false, error: 'quota' });
    expect(listTabIds).not.toHaveBeenCalled();
  });

  it('returns ok with snapshotError when persist succeeds but refresh fails', async () => {
    const local = memoryDurable();
    let reads = 0;
    const snapshotLocal = {
      ...local,
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        reads += 1;
        if (reads > 1) {
          throw new Error('refresh failed');
        }
        return local.get(keys);
      },
    };
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayAutoHide', value: false },
      },
      extensionSender(),
      {
        local: snapshotLocal,
        sync: memoryDurable(),
        listTabIds: async () => [],
      },
    );
    expect(response).toMatchObject({
      ok: true,
      snapshotError: 'refresh failed',
      reappliedTabs: 0,
      reapplyFailures: 0,
    });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.state).toBeUndefined();
    }
  });

  it('lists custom sites separately and returns a membership delta on delete', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    await persistSiteSpeed('https://vimeo.com/1', 1.5, deps);
    const snapshot = await getBehaviorSettings(
      { type: 'GET_BEHAVIOR_SETTINGS' },
      extensionSender(),
      deps,
    );
    expect(snapshot).toMatchObject({
      ok: true,
      state: { site: null },
    });
    if (snapshot.ok) {
      expect(snapshot.state).not.toHaveProperty('customSites');
    }
    const listed = await getCustomSites(extensionSender(), deps);
    expect(listed).toEqual({ ok: true, customSites: ['vimeo.com', 'www.youtube.com'] });
    const deleted = await deleteSiteBehaviorSettings(
      { type: 'DELETE_SITE_SETTINGS', hostname: 'www.youtube.com' },
      extensionSender(),
      deps,
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok || !deleted.state) {
      throw new Error('expected a snapshot');
    }
    expect(deleted.state).not.toHaveProperty('customSites');
    expect(deleted.siteMembership).toEqual({
      hostname: 'www.youtube.com',
      customized: false,
    });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'inherit' } },
    });
  });

  it('resets global defaults without deleting site records', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistGlobalBehaviorChange({ kind: 'value', field: 'speed', value: 1.5 }, deps);
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    const response = await resetGlobalBehaviorSettings(
      { type: 'RESET_GLOBAL_BEHAVIOR' },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || !response.state) {
      throw new Error('expected a snapshot');
    }
    expect(response.state.global.speed).toEqual({ value: 1, source: 'built-in' });
    expect(response.state).not.toHaveProperty('customSites');
    await expect(getCustomSites(extensionSender(), deps)).resolves.toEqual({
      ok: true,
      customSites: ['www.youtube.com'],
    });
  });

  it('resets all settings and clears custom sites', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistGlobalBehaviorChange({ kind: 'value', field: 'speed', value: 1.5 }, deps);
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    const response = await resetAllBehaviorSettings(
      { type: 'RESET_ALL_BEHAVIOR' },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || !response.state) {
      throw new Error('expected a snapshot');
    }
    expect(response.state.global.speed).toEqual({ value: 1, source: 'built-in' });
    expect(response.state).not.toHaveProperty('customSites');
    expect(response).not.toHaveProperty('siteMembership');
    await expect(getCustomSites(extensionSender(), deps)).resolves.toEqual({
      ok: true,
      customSites: [],
    });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'inherit' } },
    });
    expect(response.ok && 'skippedRecordCount' in response && response.skippedRecordCount).toBe(0);
  });

  it('resets V1 sites when global is a newer schema and reports a partial Reset All', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    deps.sync.data['defaults:site-behavior'] = { schemaVersion: 2, overrides: { extra: true } };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    await persistSiteSpeed('https://vimeo.com/1', 1.5, deps);
    const response = await resetAllBehaviorSettings(
      { type: 'RESET_ALL_BEHAVIOR' },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('expected success');
    }
    expect(response.ok && 'skippedRecordCount' in response && response.skippedRecordCount).toBe(1);
    expect(deps.sync.data['defaults:site-behavior']).toEqual({
      schemaVersion: 2,
      overrides: { extra: true },
    });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'inherit' } },
    });
    expect(deps.local.data['site:vimeo.com']).toMatchObject({
      overrides: { speed: { kind: 'inherit' } },
    });
  });

  it('rejects an entire changes batch when any change is invalid', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        changes: [
          { kind: 'value', field: 'speed', value: 1.5 },
          { kind: 'value', field: 'overlayPosition', value: 99 },
        ],
      } as Parameters<typeof setBehaviorSetting>[0],
      extensionSender(),
      deps,
    );
    expect(response).toEqual({ ok: false, error: 'Invalid change' });
    expect(deps.local.data).toEqual({});
    expect(deps.sync.data).toEqual({});
  });

  it('applies duplicate fields last-wins in one persist', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        changes: [
          { kind: 'value', field: 'speed', value: 1.25 },
          { kind: 'value', field: 'overlayVisible', value: false },
          { kind: 'value', field: 'speed', value: 2 },
        ],
      },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || !response.state) {
      throw new Error('expected a snapshot');
    }
    expect(response.state.global.speed).toEqual({ value: 2, source: 'global' });
    expect(response.state.global.overlayVisible).toEqual({ value: false, source: 'global' });
  });

  it('attaches site membership to a successful site SET', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('expected success');
    }
    expect(response.siteMembership).toEqual({
      hostname: 'www.youtube.com',
      customized: true,
    });
  });

  it('keeps a successful site SET when membership lookup fails', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    const membership = vi
      .spyOn(siteSettings, 'readSiteMembership')
      .mockRejectedValueOnce(new Error('membership failed'));
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      },
      extensionSender(),
      deps,
    );
    membership.mockRestore();
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('expected success');
    }
    expect(response).not.toHaveProperty('siteMembership');
    await expect(siteSettings.readSiteMembership('www.youtube.com', deps)).resolves.toBe(true);
  });

  it('rejects privileged reset and delete senders from the web', async () => {
    await expect(
      deleteSiteBehaviorSettings(
        { type: 'DELETE_SITE_SETTINGS', hostname: 'example.com' },
        { url: 'https://example.com/' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Unauthorized' });
    await expect(
      resetGlobalBehaviorSettings(
        { type: 'RESET_GLOBAL_BEHAVIOR' },
        { url: 'https://example.com/' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Unauthorized' });
    await expect(
      resetAllBehaviorSettings({ type: 'RESET_ALL_BEHAVIOR' }, { url: 'https://example.com/' }),
    ).resolves.toEqual({ ok: false, error: 'Unauthorized' });
  });
});
