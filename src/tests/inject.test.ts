// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { CONTENT_SCRIPT_FILE } from '../access/content-registration';
import { ensureCurrentTabEngine } from '../background/inject';

describe('ensureCurrentTabEngine', () => {
  it('skips file injection when the top-frame engine is already active', async () => {
    const scripting = {
      executeScript: vi.fn(async () => [{ result: true }]),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 11, frameIds: [0] },
        func: expect.any(Function),
      }),
    );
  });

  it('injects the top frame first and treats allFrames failure as non-fatal', async () => {
    const calls: unknown[] = [];
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          calls.push(injection.target);
          if ('func' in injection && injection.func) {
            return [{ result: false }];
          }
          if ('allFrames' in injection.target && injection.target.allFrames) {
            throw new Error('Some frames lack permission');
          }
          return [];
        },
      ),
    };

    await expect(ensureCurrentTabEngine(11, scripting)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { tabId: 11, frameIds: [0] },
      { tabId: 11, frameIds: [0] },
      { tabId: 11, allFrames: true },
    ]);
    expect(scripting.executeScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ files: [CONTENT_SCRIPT_FILE] }),
    );
  });

  it('fails the operation when required top-frame injection fails', async () => {
    const scripting = {
      executeScript: vi.fn(
        async (injection: chrome.scripting.ScriptInjection<unknown[], unknown>) => {
          if ('func' in injection && injection.func) {
            return [{ result: false }];
          }
          throw new Error('top frame blocked');
        },
      ),
    };
    await expect(ensureCurrentTabEngine(11, scripting)).rejects.toThrow('top frame blocked');
    expect(scripting.executeScript).toHaveBeenCalledTimes(2);
  });
});
