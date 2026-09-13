// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { CONTENT_SCRIPT_FILE } from '../access/content-registration';
import { ensureCurrentTabEngine } from '../background/inject';

function isFuncInjection(injection: chrome.scripting.ScriptInjection<unknown[], unknown>): boolean {
  return 'func' in injection && typeof injection.func === 'function';
}

describe('ensureCurrentTabEngine', () => {
  it('does not reinject files when every probed frame already has an engine', async () => {
    const scripting = {
      executeScript: vi.fn(async () => [
        { frameId: 0, result: true },
        { frameId: 3, result: true },
      ]),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 11, allFrames: true },
        func: expect.any(Function),
      }),
    );
  });

  it('injects only child frames that lack an engine when the top engine is already live', async () => {
    const calls: unknown[] = [];
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          calls.push({
            target: injection.target,
            files: 'files' in injection ? injection.files : undefined,
          });
          if (isFuncInjection(injection)) {
            return [
              { frameId: 0, result: true },
              { frameId: 3, result: false },
              { frameId: 7, result: false },
            ];
          }
          return [];
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { target: { tabId: 11, allFrames: true }, files: undefined },
      { target: { tabId: 11, frameIds: [3, 7] }, files: [CONTENT_SCRIPT_FILE] },
    ]);
  });

  it('injects the top frame first when it has no engine, then missing children', async () => {
    const calls: unknown[] = [];
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          calls.push(injection.target);
          if (isFuncInjection(injection)) {
            return [
              { frameId: 0, result: false },
              { frameId: 3, result: false },
            ];
          }
          return [];
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { tabId: 11, allFrames: true },
      { tabId: 11, frameIds: [0] },
      { tabId: 11, frameIds: [3] },
    ]);
    expect(scripting.executeScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ files: [CONTENT_SCRIPT_FILE] }),
    );
  });

  it('retries child frames individually when a batched child inject fails', async () => {
    const fileTargets: unknown[] = [];
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          if (isFuncInjection(injection)) {
            return [
              { frameId: 0, result: true },
              { frameId: 3, result: false },
              { frameId: 7, result: false },
            ];
          }
          fileTargets.push(injection.target);
          if (
            'frameIds' in injection.target &&
            Array.isArray(injection.target.frameIds) &&
            injection.target.frameIds.length > 1
          ) {
            throw new Error('Some frames lack permission');
          }
          return [];
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(fileTargets).toEqual([
      { tabId: 11, frameIds: [3, 7] },
      { tabId: 11, frameIds: [3] },
      { tabId: 11, frameIds: [7] },
    ]);
  });

  it('ensures the top frame when allFrames probing is rejected', async () => {
    const calls: unknown[] = [];
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          calls.push(injection.target);
          if ('allFrames' in injection.target && injection.target.allFrames) {
            throw new Error('Some frames lack permission');
          }
          if (isFuncInjection(injection)) {
            return [{ frameId: 0, result: false }];
          }
          return [];
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { tabId: 11, allFrames: true },
      { tabId: 11, frameIds: [0] },
      { tabId: 11, frameIds: [0] },
    ]);
    expect(scripting.executeScript).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ files: [CONTENT_SCRIPT_FILE] }),
    );
  });

  it('does not remount the top frame when allFrames probing is rejected and the top engine is live', async () => {
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          if ('allFrames' in injection.target && injection.target.allFrames) {
            throw new Error('Some frames lack permission');
          }
          return [{ frameId: 0, result: true }];
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(scripting.executeScript).not.toHaveBeenCalledWith(
      expect.objectContaining({ files: [CONTENT_SCRIPT_FILE] }),
    );
  });

  it('fails the operation when required top-frame injection fails', async () => {
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          if (isFuncInjection(injection)) {
            return [{ frameId: 0, result: false }];
          }
          throw new Error('top frame blocked');
        },
      ),
    };
    await expect(ensureCurrentTabEngine(11, scripting)).rejects.toThrow('top frame blocked');
    expect(scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it('treats a child-frame inject failure as non-fatal when the top engine is live', async () => {
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          if (isFuncInjection(injection)) {
            return [
              { frameId: 0, result: true },
              { frameId: 3, result: false },
            ];
          }
          throw new Error('iframe blocked');
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
  });
});
