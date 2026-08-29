// SPDX-License-Identifier: GPL-3.0-only

import { CONTENT_SCRIPT_FILE } from '../access/content-registration';

export type ScriptInjector = {
  executeScript: (
    injection: chrome.scripting.ScriptInjection<unknown[], unknown>,
  ) => Promise<unknown>;
};

export async function ensureCurrentTabEngine(
  tabId: number,
  scripting: ScriptInjector = chrome.scripting,
): Promise<void> {
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
