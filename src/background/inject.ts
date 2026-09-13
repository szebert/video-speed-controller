// SPDX-License-Identifier: GPL-3.0-only

import { CONTENT_SCRIPT_FILE } from '../access/content-registration';

export type ScriptInjector = {
  executeScript: (
    injection: chrome.scripting.ScriptInjection<unknown[], unknown>,
  ) => Promise<unknown>;
};

type EngineProbeResult = { result?: boolean; frameId?: number };

function isEngineProbeResult(value: unknown): value is EngineProbeResult[] {
  return Array.isArray(value);
}

function probeActiveEngine(): boolean {
  return (
    (globalThis as { __OSVSC_ENGINE__?: { active?: boolean } }).__OSVSC_ENGINE__?.active === true
  );
}

async function probeFrames(
  scripting: ScriptInjector,
  target: chrome.scripting.InjectionTarget,
): Promise<EngineProbeResult[] | null> {
  try {
    const results = await scripting.executeScript({
      target,
      world: 'ISOLATED',
      func: probeActiveEngine,
    });
    return isEngineProbeResult(results) ? results : [];
  } catch {
    return null;
  }
}

function frameIdOf(entry: EngineProbeResult, index: number): number | undefined {
  if (typeof entry.frameId === 'number') {
    return entry.frameId;
  }
  return index === 0 ? 0 : undefined;
}

function missingEngineFrames(results: EngineProbeResult[]): {
  topMissing: boolean;
  childIds: number[];
} {
  let topMissing = true;
  const childIds: number[] = [];
  for (const [index, entry] of results.entries()) {
    const frameId = frameIdOf(entry, index);
    if (frameId === 0) {
      if (entry.result === true) {
        topMissing = false;
      }
      continue;
    }
    if (typeof frameId === 'number' && entry.result !== true) {
      childIds.push(frameId);
    }
  }
  return { topMissing, childIds };
}

async function injectFiles(
  scripting: ScriptInjector,
  target: chrome.scripting.InjectionTarget,
): Promise<void> {
  await scripting.executeScript({
    target,
    files: [CONTENT_SCRIPT_FILE],
  });
}

async function injectChildFrames(
  tabId: number,
  scripting: ScriptInjector,
  frameIds: number[],
): Promise<void> {
  if (frameIds.length === 0) {
    return;
  }
  try {
    await injectFiles(scripting, { tabId, frameIds });
  } catch {
    if (frameIds.length === 1) {
      return;
    }
    for (const frameId of frameIds) {
      try {
        await injectFiles(scripting, { tabId, frameIds: [frameId] });
      } catch {
        // Best-effort. Chrome can reject a frame that is still ungranted.
      }
    }
  }
}

export async function ensureCurrentTabEngine(
  tabId: number,
  scripting: ScriptInjector = chrome.scripting,
): Promise<void> {
  const allFrames = await probeFrames(scripting, { tabId, allFrames: true });
  if (allFrames) {
    const { topMissing, childIds } = missingEngineFrames(allFrames);
    if (topMissing) {
      await injectFiles(scripting, { tabId, frameIds: [0] });
    }
    await injectChildFrames(tabId, scripting, childIds);
    return;
  }

  const top = await probeFrames(scripting, { tabId, frameIds: [0] });
  if (!top?.some((entry) => entry.result === true)) {
    await injectFiles(scripting, { tabId, frameIds: [0] });
  }
}
