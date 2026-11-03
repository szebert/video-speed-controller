// SPDX-License-Identifier: GPL-3.0-only

import { selectHttpHttpsHostPatterns, type HostPattern } from './site-access';

export const RUNTIME_SCRIPT_ID = 'osvsc-runtime';
export const SHADOW_ATTACH_SCRIPT_ID = 'osvsc-shadow-attach';
export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';
export const SHADOW_ATTACH_SCRIPT_FILE = 'content-scripts/shadow-attach.js';

const SCRIPT_IDS = [RUNTIME_SCRIPT_ID, SHADOW_ATTACH_SCRIPT_ID] as const;

export type ScriptingApi = {
  getRegisteredContentScripts: (filter?: {
    ids?: string[];
  }) => Promise<chrome.scripting.RegisteredContentScript[]>;
  registerContentScripts: (scripts: chrome.scripting.RegisteredContentScript[]) => Promise<void>;
  updateContentScripts: (scripts: chrome.scripting.RegisteredContentScript[]) => Promise<void>;
  unregisterContentScripts: (filter?: { ids?: string[] }) => Promise<void>;
};

function runtimeScripts(matches: HostPattern[]): chrome.scripting.RegisteredContentScript[] {
  const shared = {
    matches,
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true,
  } as const;
  return [
    {
      ...shared,
      id: RUNTIME_SCRIPT_ID,
      js: [CONTENT_SCRIPT_FILE],
      runAt: 'document_idle',
      world: 'ISOLATED',
    },
    {
      ...shared,
      id: SHADOW_ATTACH_SCRIPT_ID,
      js: [SHADOW_ATTACH_SCRIPT_FILE],
      runAt: 'document_start',
      world: 'MAIN',
    },
  ];
}

export async function reconcileContentScripts(
  origins: readonly string[],
  scripting: ScriptingApi = chrome.scripting,
): Promise<HostPattern[]> {
  const matches = selectHttpHttpsHostPatterns(origins);
  const existing = await scripting.getRegisteredContentScripts({ ids: [...SCRIPT_IDS] });
  const presentIds = new Set(existing.map((script) => script.id));

  if (matches.length === 0) {
    const active = SCRIPT_IDS.filter((id) => presentIds.has(id));
    if (active.length > 0) {
      await scripting.unregisterContentScripts({ ids: [...active] });
    }
    return matches;
  }

  const desired = runtimeScripts(matches);
  const missing = desired.filter((script) => !presentIds.has(script.id));
  const present = desired.filter((script) => presentIds.has(script.id));
  if (missing.length > 0) {
    await scripting.registerContentScripts(missing);
  }
  if (present.length > 0) {
    await scripting.updateContentScripts(present);
  }
  return matches;
}
