// SPDX-License-Identifier: GPL-3.0-only

import { selectHttpHttpsHostPatterns, type HostPattern } from './site-access';

export const RUNTIME_SCRIPT_ID = 'osvsc-runtime';
export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

export type ScriptingApi = {
  getRegisteredContentScripts: (filter?: {
    ids?: string[];
  }) => Promise<chrome.scripting.RegisteredContentScript[]>;
  registerContentScripts: (scripts: chrome.scripting.RegisteredContentScript[]) => Promise<void>;
  updateContentScripts: (scripts: chrome.scripting.RegisteredContentScript[]) => Promise<void>;
  unregisterContentScripts: (filter?: { ids?: string[] }) => Promise<void>;
};

const runtimeScript = (matches: HostPattern[]): chrome.scripting.RegisteredContentScript => ({
  id: RUNTIME_SCRIPT_ID,
  js: [CONTENT_SCRIPT_FILE],
  matches,
  allFrames: true,
  matchOriginAsFallback: true,
  persistAcrossSessions: true,
  runAt: 'document_idle',
  world: 'ISOLATED',
});

export async function reconcileContentScripts(
  origins: readonly string[],
  scripting: ScriptingApi = chrome.scripting,
): Promise<HostPattern[]> {
  const matches = selectHttpHttpsHostPatterns(origins);
  const existing = await scripting.getRegisteredContentScripts({
    ids: [RUNTIME_SCRIPT_ID],
  });
  const present = existing.some((script) => script.id === RUNTIME_SCRIPT_ID);

  if (matches.length === 0) {
    if (present) {
      await scripting.unregisterContentScripts({ ids: [RUNTIME_SCRIPT_ID] });
    }
    return matches;
  }

  if (!present) {
    await scripting.registerContentScripts([runtimeScript(matches)]);
    return matches;
  }

  await scripting.updateContentScripts([runtimeScript(matches)]);
  return matches;
}
