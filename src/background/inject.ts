// SPDX-License-Identifier: GPL-3.0-only

import { CONTENT_SCRIPT_FILE } from '../access/content-registration';

export type ScriptInjector = {
  executeScript: (
    injection: chrome.scripting.ScriptInjection<unknown[], unknown>,
  ) => Promise<unknown>;
};

type EngineProbeResult = { result?: boolean };

function isEngineActiveResult(value: unknown): value is EngineProbeResult[] {
  return Array.isArray(value);
}

async function hasActiveTopEngine(tabId: number, scripting: ScriptInjector): Promise<boolean> {
  try {
    const results = await scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'ISOLATED',
      func: () =>
        (globalThis as { __OSVSC_ENGINE__?: { active?: boolean } }).__OSVSC_ENGINE__?.active ===
        true,
    });
    return isEngineActiveResult(results) && results.some((entry) => entry.result === true);
  } catch {
    return false;
  }
}

export async function ensureCurrentTabEngine(
  tabId: number,
  scripting: ScriptInjector = chrome.scripting,
): Promise<void> {
  if (await hasActiveTopEngine(tabId, scripting)) {
    return;
  }
  await scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: [CONTENT_SCRIPT_FILE],
  });
  try {
    await scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch {
    // Best-effort. Chrome can reject the entire allFrames pass if any frame lacks permission.
  }
}
