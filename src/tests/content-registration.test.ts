// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_SCRIPT_FILE,
  reconcileContentScripts,
  RUNTIME_SCRIPT_ID,
} from '../access/content-registration';
import type { ScriptingApi } from '../access/content-registration';

function mockScripting() {
  const registered: chrome.scripting.RegisteredContentScript[] = [];
  const api: ScriptingApi = {
    getRegisteredContentScripts: vi.fn(async () => [...registered]),
    registerContentScripts: vi.fn(async (scripts) => {
      if (registered.some((item) => item.id === scripts[0]?.id)) {
        throw new Error('Duplicate script id');
      }
      registered.push(...scripts);
    }),
    updateContentScripts: vi.fn(async (scripts) => {
      const index = registered.findIndex((item) => item.id === scripts[0]?.id);
      if (index < 0) {
        throw new Error('Missing script id');
      }
      registered[index] = scripts[0]!;
    }),
    unregisterContentScripts: vi.fn(async () => {
      registered.splice(0, registered.length);
    }),
  };
  return { api, registered };
}

describe('content script registration', () => {
  let scripting: ReturnType<typeof mockScripting>;

  beforeEach(() => {
    scripting = mockScripting();
  });

  it('registers once and updates matches without re-registering the same id', async () => {
    await reconcileContentScripts(['https://youtube.com:443/*'], scripting.api);
    await reconcileContentScripts(['https://youtube.com:443/*'], scripting.api);
    await reconcileContentScripts(
      ['https://youtube.com:443/*', 'https://reddit.com:443/*'],
      scripting.api,
    );

    expect(scripting.api.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(scripting.api.updateContentScripts).toHaveBeenCalledTimes(2);
    expect(scripting.registered).toHaveLength(1);
    expect(scripting.registered[0]?.id).toBe(RUNTIME_SCRIPT_ID);
    expect(scripting.registered[0]?.js).toEqual([CONTENT_SCRIPT_FILE]);
    expect(scripting.registered[0]?.matches).toEqual([
      'https://reddit.com:443/*',
      'https://youtube.com:443/*',
    ]);
    expect(scripting.registered[0]?.persistAcrossSessions).toBe(true);
    expect(scripting.registered[0]?.allFrames).toBe(true);
    expect(scripting.registered[0]?.matchOriginAsFallback).toBe(true);
  });

  it('preserves Chrome wildcard grants instead of reconstructing concrete origins', async () => {
    const matches = await reconcileContentScripts(['https://*/*', 'http://*/*'], scripting.api);
    expect(matches).toEqual(['http://*/*', 'https://*/*']);
    expect(scripting.registered[0]?.matches).toEqual(['http://*/*', 'https://*/*']);
  });

  it('unregisters when no http/https grants remain', async () => {
    await reconcileContentScripts(['https://*/*'], scripting.api);
    await reconcileContentScripts([], scripting.api);
    expect(scripting.api.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [RUNTIME_SCRIPT_ID],
    });
    expect(scripting.registered).toHaveLength(0);
  });
});
