// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { sendOptionsRequest, sendPopupRequest } from '../protocol/rpc';
import {
  ExportBackupResponseSchema,
  ExportBackupRequestSchema,
  type ExportBackupRequest,
  type ExportBackupResponse,
  type SetThemeRequest,
  type SetThemeResponse,
} from '../protocol/schemas/options-background';
import {
  SetSpeedResponseSchema,
  type SetSpeedRequest,
  type SetSpeedResponse,
} from '../protocol/schemas/popup-background';
import { parseBackgroundInbound } from '../protocol/schemas/background-inbound';
import { sendContentRequest } from '../protocol/content/client';
import {
  DispatchTabActionResponseSchema,
  type DispatchTabActionRequest,
  type DispatchTabActionResponse,
} from '../protocol/content/content-background';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RPC response parsing', () => {
  it('validates and strips an options response once with the request-specific return type', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn(async () => ({ ok: true, backupText: '{}', extra: true })) },
    });
    const parse = vi.spyOn(ExportBackupResponseSchema, 'safeParse');
    const result = await sendOptionsRequest({ type: 'EXPORT_BACKUP' });
    expectTypeOf(result).toEqualTypeOf<ExportBackupResponse | undefined>();
    expect(result).toEqual({ ok: true, backupText: '{}' });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('validates and strips a popup response once with the request-specific return type', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn(async () => ({ ok: true, targetSpeed: 2, extra: true })) },
    });
    const parse = vi.spyOn(SetSpeedResponseSchema, 'safeParse');
    const result = await sendPopupRequest({
      type: 'SET_SPEED',
      tabId: 1,
      url: 'https://a.example',
      speed: 2,
    });
    expectTypeOf(result).toEqualTypeOf<SetSpeedResponse | undefined>();
    expect(result).toEqual({ ok: true, targetSpeed: 2 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('validates and strips a Mini response once with the request-specific return type', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          previousTargetSpeed: 1,
          targetSpeed: 2,
          extra: true,
        })),
      },
    });
    const parse = vi.spyOn(DispatchTabActionResponseSchema, 'safeParse');
    const result = await sendContentRequest({
      type: 'DISPATCH_TAB_ACTION',
      action: 'increaseSpeed',
    });
    expectTypeOf(result).toEqualTypeOf<DispatchTabActionResponse | undefined>();
    expect(result).toEqual({ ok: true, previousTargetSpeed: 1, targetSpeed: 2 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('rejects a response belonging to a different endpoint', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
    });
    await expect(sendOptionsRequest({ type: 'EXPORT_BACKUP' })).resolves.toBeUndefined();
    await expect(
      sendPopupRequest({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example', speed: 2 }),
    ).resolves.toBeUndefined();
    await expect(
      sendContentRequest({ type: 'DISPATCH_TAB_ACTION', action: 'increaseSpeed' }),
    ).resolves.toBeUndefined();
  });

  it('preserves validated failure responses and propagates transport failures', async () => {
    const sendMessage = vi.fn(async (): Promise<unknown> => ({
      ok: false,
      error: 'denied',
      extra: true,
    }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await expect(sendOptionsRequest({ type: 'EXPORT_BACKUP' })).resolves.toEqual({
      ok: false,
      error: 'denied',
    });
    await expect(
      sendPopupRequest({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example', speed: 2 }),
    ).resolves.toEqual({ ok: false, error: 'denied' });
    sendMessage.mockRejectedValue(new Error('Disconnected'));
    await expect(sendOptionsRequest({ type: 'EXPORT_BACKUP' })).rejects.toThrow('Disconnected');
    await expect(
      sendPopupRequest({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example', speed: 2 }),
    ).rejects.toThrow('Disconnected');
  });

  it('retains the response union for union requests', () => {
    async function sendUnion(request: ExportBackupRequest | SetThemeRequest) {
      return sendOptionsRequest(request);
    }
    expectTypeOf(sendUnion).returns.toEqualTypeOf<
      Promise<ExportBackupResponse | SetThemeResponse | undefined>
    >();
    expectTypeOf(sendPopupRequest<SetSpeedRequest>).returns.toEqualTypeOf<
      Promise<SetSpeedResponse | undefined>
    >();
    expectTypeOf(sendContentRequest<DispatchTabActionRequest>).returns.toEqualTypeOf<
      Promise<DispatchTabActionResponse | undefined>
    >();
  });

  it('parses inbound requests once and returns the parsed discriminated union', () => {
    const parse = vi.spyOn(ExportBackupRequestSchema, 'safeParse');
    const parsed = parseBackgroundInbound({ type: 'EXPORT_BACKUP', extra: true });
    expect(parsed).toEqual({ channel: 'options', request: { type: 'EXPORT_BACKUP' } });
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
