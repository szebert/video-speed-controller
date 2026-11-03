// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_SCRIPT_FILE,
  reconcileContentScripts,
  RUNTIME_SCRIPT_ID,
  SHADOW_ATTACH_SCRIPT_FILE,
  SHADOW_ATTACH_SCRIPT_ID,
} from '../access/content-registration';
import type { ScriptingApi } from '../access/content-registration';

function mockScripting() {
  const registered: chrome.scripting.RegisteredContentScript[] = [];
  const api: ScriptingApi = {
    getRegisteredContentScripts: vi.fn(async (filter) => {
      if (!filter?.ids) {
        return [...registered];
      }
      return registered.filter((item) => filter.ids?.includes(item.id));
    }),
    registerContentScripts: vi.fn(async (scripts) => {
      for (const script of scripts) {
        if (registered.some((item) => item.id === script.id)) {
          throw new Error('Duplicate script id');
        }
        registered.push(script);
      }
    }),
    updateContentScripts: vi.fn(async (scripts) => {
      for (const script of scripts) {
        const index = registered.findIndex((item) => item.id === script.id);
        if (index < 0) {
          throw new Error('Missing script id');
        }
        registered[index] = script;
      }
    }),
    unregisterContentScripts: vi.fn(async (filter) => {
      const ids = filter?.ids;
      for (let index = registered.length - 1; index >= 0; index -= 1) {
        if (!ids || ids.includes(registered[index]!.id)) {
          registered.splice(index, 1);
        }
      }
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
    expect(scripting.registered).toHaveLength(2);
    expect(scripting.registered.map((script) => script.id)).toEqual([
      RUNTIME_SCRIPT_ID,
      SHADOW_ATTACH_SCRIPT_ID,
    ]);
    expect(scripting.registered[0]?.js).toEqual([CONTENT_SCRIPT_FILE]);
    expect(scripting.registered[1]?.js).toEqual([SHADOW_ATTACH_SCRIPT_FILE]);
    expect(scripting.registered[1]?.runAt).toBe('document_start');
    expect(scripting.registered[1]?.world).toBe('MAIN');
    expect(scripting.registered[0]?.matches).toEqual([
      'https://reddit.com:443/*',
      'https://youtube.com:443/*',
    ]);
    expect(scripting.registered[1]?.matches).toEqual(scripting.registered[0]?.matches);
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
      ids: [RUNTIME_SCRIPT_ID, SHADOW_ATTACH_SCRIPT_ID],
    });
    expect(scripting.registered).toHaveLength(0);
  });
});
