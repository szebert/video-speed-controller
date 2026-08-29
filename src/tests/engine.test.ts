// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { destroyEngine, getActiveEngine, startEngine } from '../core/video-speed-engine';

describe('engine lifecycle', () => {
  afterEach(() => {
    destroyEngine();
    document.body.replaceChildren();
  });

  it('is idempotent while active and restartable after destroy', () => {
    const first = startEngine();
    const second = startEngine();
    expect(second).toBe(first);
    expect(getActiveEngine()).toBe(first);

    expect(destroyEngine()).toBe(true);
    expect(getActiveEngine()).toBeUndefined();
    expect(globalThis.__OSVSC_ENGINE__).toBeUndefined();

    const third = startEngine();
    expect(third).not.toBe(first);
    expect(third.active).toBe(true);
  });
});
