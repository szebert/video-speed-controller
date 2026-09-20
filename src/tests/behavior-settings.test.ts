// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSiteBehaviorSettings,
  exportBehaviorBackup,
  getBehaviorSettings,
  getCustomSites,
  importBehaviorBackup,
  resetAllBehaviorSettings,
  resetGlobalBehaviorSettings,
  setBehaviorSetting,
  setHotkeySetting,
} from '../background/behavior-settings';
import { BUILT_IN_HOTKEYS } from '../settings/hotkey-binding';
import { GLOBAL_BEHAVIOR_KEY, OVERLAY_POSITION } from '../settings/site-behavior';
import {
  persistGlobalBehaviorChange,
  resetBehaviorDefaultsRepairBackoff,
} from '../storage/behavior-defaults';
import {
  persistSiteHotkeyChanges,
  persistSiteSpeed,
  resetSiteRepairBackoff,
} from '../storage/site-settings';
import * as siteSettings from '../storage/site-settings';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import {
  persistSiteSpeedCoalesced,
  resetSiteSpeedPersistCoalescerForTests,
} from '../background/coalesce-site-speed';
import { resetTabMutationQueue } from '../background/tab-mutation-queue';
import { memoryDurable } from './memory-store';
import { tabBehavior } from './tab-behavior-fixture';

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
    resetSiteSpeedPersistCoalescerForTests();
    vi.useRealTimers();
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
    await expect(exportBehaviorBackup({ url: 'https://example.com/' })).resolves.toEqual({
      ok: false,
      error: 'Unauthorized',
    });
    await expect(
      importBehaviorBackup(
        { type: 'IMPORT_BACKUP', mode: 'merge', backupText: '{}' },
        { url: 'https://example.com/' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('flushes coalesced site speeds before export', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const persist = vi.fn(async () => {});
    resetSiteSpeedPersistCoalescerForTests({ persist });
    await persistSiteSpeedCoalesced('https://www.youtube.com/watch', 1.25);
    void persistSiteSpeedCoalesced('https://www.youtube.com/watch', 1.75);
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(exportBehaviorBackup(extensionSender(), stores())).resolves.toMatchObject({
      ok: true,
    });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://www.youtube.com/watch', 1.75);
  });

  it('reports site speedOverrideKind and seedTarget from raw overrides', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    const missing = await getBehaviorSettings(
      { type: 'GET_BEHAVIOR_SETTINGS', hostname: 'new.example' },
      extensionSender(),
      deps,
    );
    expect(missing).toMatchObject({
      ok: true,
      state: {
        site: {
          hostname: 'new.example',
          speedOverrideKind: 'missing',
          defaultSpeedOverrideKind: 'missing',
          seedTarget: 1,
        },
      },
    });

    await persistGlobalBehaviorChange({ kind: 'value', field: 'speed', value: 2 }, deps);
    await persistGlobalBehaviorChange({ kind: 'value', field: 'defaultSpeed', value: 1.25 }, deps);
    const seeded = await getBehaviorSettings(
      { type: 'GET_BEHAVIOR_SETTINGS', hostname: 'new.example' },
      extensionSender(),
      deps,
    );
    expect(seeded).toMatchObject({
      ok: true,
      state: {
        site: {
          hostname: 'new.example',
          speedOverrideKind: 'missing',
          defaultSpeedOverrideKind: 'missing',
          seedTarget: 2,
        },
      },
    });

    await persistSiteSpeed('https://www.youtube.com/watch', 1.5, deps);
    const valued = await getBehaviorSettings(
      { type: 'GET_BEHAVIOR_SETTINGS', hostname: 'www.youtube.com' },
      extensionSender(),
      deps,
    );
    expect(valued).toMatchObject({
      ok: true,
      state: {
        site: {
          hostname: 'www.youtube.com',
          speedOverrideKind: 'value',
          defaultSpeedOverrideKind: 'missing',
          seedTarget: 1.5,
        },
      },
    });

    const inherited = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'inherit', field: 'speed' },
        snapshotHostname: 'www.youtube.com',
      },
      extensionSender(),
      deps,
    );
    expect(inherited).toMatchObject({
      ok: true,
      state: {
        site: {
          hostname: 'www.youtube.com',
          speedOverrideKind: 'inherit',
          defaultSpeedOverrideKind: 'missing',
          seedTarget: 1.25,
        },
      },
    });

    const inheritedDefault = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'inherit', field: 'defaultSpeed' },
        snapshotHostname: 'www.youtube.com',
      },
      extensionSender(),
      deps,
    );
    expect(inheritedDefault).toMatchObject({
      ok: true,
      state: {
        site: {
          hostname: 'www.youtube.com',
          speedOverrideKind: 'inherit',
          defaultSpeedOverrideKind: 'inherit',
          seedTarget: 1.25,
        },
      },
    });
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
      hotkeys: expect.objectContaining({
        decreaseSpeed: expect.objectContaining({ source: 'built-in' }),
        increaseSpeed: expect.objectContaining({ source: 'built-in' }),
        resetSpeed: expect.objectContaining({ source: 'built-in' }),
      }),
      speedOverrideKind: 'value',
      defaultSpeedOverrideKind: 'missing',
      seedTarget: 1.25,
    });
  });

  it('uses post-persist rememberLastSpeed when choosing site speed reapply', async () => {
    const deps = stores();
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    const data: Record<string, unknown> = { 'tab:1': tabBehavior(2) };
    const tabStateStore = {
      data,
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        if (typeof keys === 'string') {
          return { [keys]: data[keys] };
        }
        return { ...data };
      },
      async set(items: Record<string, unknown>) {
        Object.assign(data, items);
      },
      async remove(keys: string | string[]) {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          delete data[key];
        }
      },
    };
    const apply = vi.fn();
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        changes: [
          { kind: 'value', field: 'rememberLastSpeed', value: false },
          { kind: 'value', field: 'speed', value: 1.5 },
        ],
      },
      extensionSender(),
      {
        ...deps,
        getTab: async () => ({ id: 1, url: 'https://www.youtube.com/watch' }) as chrome.tabs.Tab,
        tabStateStore,
        readBehavior: async () => tabBehavior(1, { rememberLastSpeed: false }),
        apply,
      },
    );
    expect(response).toMatchObject({ ok: true, reappliedTabs: 1, reapplyFailures: 0 });
    expect(data['tab:1']).toEqual(
      expect.objectContaining({ targetSpeed: 2, rememberLastSpeed: false }),
    );
  });

  it('preserves the tab target when a site speed write cannot reread remember', async () => {
    const deps = stores();
    await persistGlobalBehaviorChange(
      { kind: 'value', field: 'rememberLastSpeed', value: false },
      deps,
    );
    await persistSiteSpeed('https://www.youtube.com/watch', 1.25, deps);
    const data: Record<string, unknown> = {
      'tab:1': tabBehavior(2, { rememberLastSpeed: false }),
    };
    const tabStateStore = {
      data,
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        if (typeof keys === 'string') {
          return { [keys]: data[keys] };
        }
        return { ...data };
      },
      async set(items: Record<string, unknown>) {
        Object.assign(data, items);
      },
      async remove(keys: string | string[]) {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          delete data[key];
        }
      },
    };
    const remember = vi
      .spyOn(siteSettings, 'resolveAppliedSiteBehaviorForUrl')
      .mockRejectedValueOnce(new Error('remember read failed'));
    const apply = vi.fn();
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      },
      extensionSender(),
      {
        ...deps,
        getTab: async () => ({ id: 1, url: 'https://www.youtube.com/watch' }) as chrome.tabs.Tab,
        tabStateStore,
        readBehavior: async () => tabBehavior(1, { rememberLastSpeed: false }),
        apply,
      },
    );
    remember.mockRestore();
    expect(response.ok).toBe(true);
    expect(data['tab:1']).toEqual(expect.objectContaining({ targetSpeed: 2 }));
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
        local: {
          ...memoryDurable(),
          async set() {
            throw new Error('quota');
          },
        },
        sync: memoryDurable(),
        listTabIds,
      },
    );
    expect(response).toEqual({ ok: false, error: 'quota' });
    expect(listTabIds).not.toHaveBeenCalled();
  });

  it('returns ok with snapshotError when persist succeeds but refresh fails', async () => {
    const local = memoryDurable();
    let persistCommitted = false;
    let postPersistBehaviorReads = 0;
    const snapshotLocal = {
      ...local,
      async set(items: Record<string, unknown>) {
        await local.set(items);
        persistCommitted = true;
      },
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        if (persistCommitted && keys === GLOBAL_BEHAVIOR_KEY) {
          postPersistBehaviorReads += 1;
          if (postPersistBehaviorReads > 1) {
            throw new Error('refresh failed');
          }
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

  it('still reapplies when persist succeeds but post-persist remember read fails', async () => {
    const local = memoryDurable();
    let persistCommitted = false;
    const rememberLocal = {
      ...local,
      async set(items: Record<string, unknown>) {
        await local.set(items);
        persistCommitted = true;
      },
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        if (persistCommitted && keys === GLOBAL_BEHAVIOR_KEY) {
          throw new Error('remember read failed');
        }
        return local.get(keys);
      },
    };
    const listTabIds = vi.fn(async () => []);
    const response = await setBehaviorSetting(
      {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayAutoHide', value: false },
      },
      extensionSender(),
      {
        local: rememberLocal,
        sync: memoryDurable(),
        listTabIds,
      },
    );
    expect(response).toMatchObject({
      ok: true,
      snapshotError: 'remember read failed',
      reappliedTabs: 0,
      reapplyFailures: 0,
    });
    expect(listTabIds).toHaveBeenCalled();
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
    expect(listed).toEqual({
      ok: true,
      customSites: [
        { hostname: 'vimeo.com', lastUsedAt: 1000 },
        { hostname: 'www.youtube.com', lastUsedAt: 1000 },
      ],
    });
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
      customSites: [{ hostname: 'www.youtube.com', lastUsedAt: 1000 }],
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
      lastUsedAt: 1000,
    });
  });

  it('keeps a successful site SET when membership lookup fails', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    const membership = vi
      .spyOn(siteSettings, 'readCustomSiteSummary')
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
    await expect(siteSettings.readCustomSiteSummary('www.youtube.com', deps)).resolves.toEqual({
      hostname: 'www.youtube.com',
      lastUsedAt: 1000,
    });
  });

  it('allows inherit when the parent binding is shadowed by a site override', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistSiteHotkeyChanges(
      'https://www.youtube.com/watch',
      [
        {
          kind: 'hotkey-value',
          action: 'decreaseSpeed',
          value: { ...BUILT_IN_HOTKEYS.increaseSpeed },
        },
        {
          kind: 'hotkey-value',
          action: 'increaseSpeed',
          value: { code: 'KeyA', ctrl: false, alt: false, shift: false, meta: false },
        },
      ],
      deps,
    );
    const response = await setHotkeySetting(
      {
        type: 'SET_HOTKEY_SETTING',
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        snapshotHostname: 'www.youtube.com',
        change: { kind: 'hotkey-inherit', action: 'increaseSpeed' },
      },
      extensionSender(),
      deps,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || !response.state?.site) {
      throw new Error('expected a site snapshot');
    }
    expect(response.state.site.hotkeys.decreaseSpeed).toEqual({
      value: { ...BUILT_IN_HOTKEYS.increaseSpeed },
      source: 'site',
    });
    expect(response.state.site.hotkeys.increaseSpeed).toEqual({
      value: { ...BUILT_IN_HOTKEYS.increaseSpeed },
      source: 'built-in',
    });
  });

  it('rejects two site overrides that use the same shortcut', async () => {
    const deps = { ...stores(), listTabIds: async () => [] };
    await persistSiteHotkeyChanges(
      'https://www.youtube.com/watch',
      [
        {
          kind: 'hotkey-value',
          action: 'decreaseSpeed',
          value: { ...BUILT_IN_HOTKEYS.increaseSpeed },
        },
      ],
      deps,
    );
    const before = structuredClone(deps.local.data['site:www.youtube.com']);
    await expect(
      setHotkeySetting(
        {
          type: 'SET_HOTKEY_SETTING',
          scope: { kind: 'site', hostname: 'www.youtube.com' },
          change: {
            kind: 'hotkey-value',
            action: 'increaseSpeed',
            value: { ...BUILT_IN_HOTKEYS.increaseSpeed },
          },
        },
        extensionSender(),
        deps,
      ),
    ).resolves.toEqual({ ok: false, error: 'Hotkey already used' });
    expect(deps.local.data['site:www.youtube.com']).toEqual(before);
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
