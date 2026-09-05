// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApplyTabBehaviorRequestSchema,
  parseBackgroundToContent,
} from '../protocol/content/background-content';
import { contentFailureMessage, sendContentRequest } from '../protocol/content/client';
import {
  AdjustSpeedRequestSchema,
  AdjustSpeedResponseSchema,
  CONTENT_TO_BACKGROUND,
  OpenOptionsPageResponseSchema,
  SetOverlayPositionResponseSchema,
} from '../protocol/content/content-background';
import { tabBehavior } from './tab-behavior-fixture';

describe('content Mini protocol', () => {
  it('parses current content requests and strips extra keys', () => {
    expect(
      AdjustSpeedRequestSchema.safeParse({
        type: 'ADJUST_SPEED',
        direction: 1,
        extra: true,
      }).data,
    ).toEqual({ type: 'ADJUST_SPEED', direction: 1 });
    expect(
      CONTENT_TO_BACKGROUND.FRAME_READY.request.safeParse({ type: 'FRAME_READY' }).success,
    ).toBe(true);
  });

  it('rejects missing or malformed known APPLY fields', () => {
    expect(
      parseBackgroundToContent({ type: 'APPLY_TAB_BEHAVIOR', behavior: { targetSpeed: 1.5 } }),
    ).toBe(null);
    expect(
      parseBackgroundToContent({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), overlayPosition: 9 },
      }),
    ).toBe(null);
    expect(
      ApplyTabBehaviorRequestSchema.safeParse({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), targetSpeed: '1.5' },
      }).success,
    ).toBe(false);
  });

  it('strips extra outer and nested APPLY keys', () => {
    expect(
      parseBackgroundToContent({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), seekInterval: 10 },
        reason: 'settings-change',
      }),
    ).toEqual({
      type: 'APPLY_TAB_BEHAVIOR',
      behavior: tabBehavior(1.5),
    });
  });

  it('rejects invalid content responses without synthesizing an error', () => {
    expect(AdjustSpeedResponseSchema.safeParse({ bananas: 123 }).success).toBe(false);
    expect(AdjustSpeedResponseSchema.safeParse({ ok: false }).success).toBe(false);
    expect(SetOverlayPositionResponseSchema.safeParse({ ok: false }).success).toBe(false);
    expect(OpenOptionsPageResponseSchema.safeParse({ ok: true, extra: true }).data).toEqual({
      ok: true,
    });
    expect(AdjustSpeedResponseSchema.safeParse({ ok: true, targetSpeed: 1.25 }).data).toEqual({
      ok: true,
      targetSpeed: 1.25,
    });
  });

  it('reads a failure message only after a successful parse', () => {
    expect(contentFailureMessage({ ok: false, error: 'Missing tab' })).toBe('Missing tab');
    expect(
      contentFailureMessage({
        ok: true,
        reapplyError: 'Failed to apply overlay position',
      }),
    ).toBe('Failed to apply overlay position');
    expect(contentFailureMessage({ ok: true, persistError: 'quota' })).toBe('quota');
    expect(contentFailureMessage({ ok: true })).toBeNull();
  });
});

describe('sendContentRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not runtime-parse constructed requests and returns undefined for invalid replies', async () => {
    const sendMessage = vi.fn(async (request: unknown) => {
      expect(request).toEqual({ type: 'OPEN_OPTIONS_PAGE', extra: true });
      return { bananas: 123 };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await expect(
      sendContentRequest({ type: 'OPEN_OPTIONS_PAGE', extra: true } as {
        type: 'OPEN_OPTIONS_PAGE';
      }),
    ).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects transport errors and accepts a valid response', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => {
          throw new Error('Receiving end does not exist');
        }),
      },
    });
    await expect(sendContentRequest({ type: 'OPEN_OPTIONS_PAGE' })).rejects.toThrow(
      'Receiving end does not exist',
    );

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: true })),
      },
    });
    await expect(sendContentRequest({ type: 'OPEN_OPTIONS_PAGE' })).resolves.toEqual({ ok: true });
  });
});
