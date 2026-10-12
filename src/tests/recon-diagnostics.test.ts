// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/video-speed-engine', () => ({ getActiveEngine: () => undefined }));

describe('opt-in reconnaissance diagnostics', () => {
  const sendMessage = vi.fn();
  const addListener = vi.fn();
  const removeListener = vi.fn();
  const getAll = vi.fn();
  const contains = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OSVSC_RECON', '1');
    vi.stubEnv('OSVSC_RECON_ENDPOINT', 'http://127.0.0.1:4174/events/test');
    sendMessage.mockReset().mockResolvedValue({ ok: true });
    addListener.mockReset();
    removeListener.mockReset();
    getAll
      .mockReset()
      .mockResolvedValue({ origins: ['https://www.youtube.com:443/*'], permissions: ['storage'] });
    contains.mockReset().mockResolvedValue(true);
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extid',
        sendMessage,
        getURL: (path: string) => `chrome-extension://extid/${path}`,
        getManifest: () => ({ version: '0.1.0' }),
        onMessage: { addListener, removeListener },
      },
      permissions: {
        getAll,
        contains,
        onAdded: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        request: vi.fn(),
      },
      tabs: {
        getCurrent: vi.fn(async () => undefined),
        query: vi.fn(async () => [{ id: 7, url: 'https://www.youtube.com/watch?v=private-token' }]),
      },
      storage: { session: { get: vi.fn(async () => ({})) } },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not send any events without the explicit development opt-in', async () => {
    vi.stubEnv('OSVSC_RECON', '');
    const { emitRecon, recordRecon } = await import('../diagnostics/recon-transport');
    emitRecon('ignored', {});
    await recordRecon('ignored', {});
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('calls the native grant synchronously, returns its original promise, and logs the exact-port result', async () => {
    sendMessage.mockImplementation(async (message) =>
      message.type === 'GET_POPUP_STATE'
        ? {
            supported: true,
            hostname: 'www.youtube.com',
            seedTarget: null,
            tabTarget: null,
            siteAccess: false,
            speedMin: 0.25,
            speedMax: 4,
            decreaseSpeedStep: 0.25,
            increaseSpeedStep: 0.25,
          }
        : { ok: true },
    );
    const { PopupController } = await import('../entrypoints/popup/popup-controller');
    const controller = new PopupController();
    controller.start();
    await vi.waitFor(() => expect(controller.getState().view).not.toBeNull());
    const calls: string[] = [];
    let resolve!: (value: boolean) => void;
    const nativePromise = new Promise<boolean>((done) => {
      resolve = done;
    });
    vi.mocked(chrome.permissions.request).mockImplementation(() => {
      calls.push('native');
      return nativePromise;
    });
    sendMessage.mockImplementation(async () => {
      calls.push('diagnostic');
      return { ok: true };
    });
    const returned = controller.requestGrant();
    expect(calls[0]).toBe('native');
    expect(returned).toBe(nativePromise);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://www.youtube.com:443/*'],
    });
    resolve(true);
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'permission.result',
          data: { tabId: 7, outcome: 'true' },
        }),
      ),
    );
    expect(contains).toHaveBeenCalledWith({ origins: ['https://www.youtube.com:443/*'] });
    expect(
      JSON.stringify(
        sendMessage.mock.calls.filter(([message]) => message.type === 'OSVSC_RECON_EVENT'),
      ),
    ).not.toContain('private-token');
    controller.destroy();
  });

  it('distinguishes false and rejected permission outcomes', async () => {
    const { observeGrant } = await import('../diagnostics/recon-popup');
    observeGrant(Promise.resolve(false), 'https://www.youtube.com/watch', 7, true);
    observeGrant(
      Promise.reject(new Error('Native failure')),
      'https://www.twitch.tv/channel',
      8,
      true,
    );
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'permission.result',
          data: { tabId: 7, outcome: 'false' },
        }),
      );
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'permission.result',
          data: { tabId: 8, outcome: 'rejected', error: 'Native failure' },
        }),
      );
    });
  });

  it('captures media in open shadow roots without page text or URLs, retains identities, and cancels pending work on cleanup', async () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    video.src = 'https://example.com/private-media?token=secret';
    const holder = document.createElement('div');
    const shadowVideo = document.createElement('video');
    holder.attachShadow({ mode: 'open' }).append(shadowVideo);
    document.body.append(video, holder, document.createTextNode('private-page-text'));
    const { startReconContent } = await import('../diagnostics/recon-content');
    const stop = startReconContent();
    const onMessage = addListener.mock.calls[0]![0];
    const response = vi.fn();
    expect(onMessage({ type: 'OSVSC_RECON_CHECKPOINT' }, { id: 'extid' }, response)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    const first = sendMessage.mock.calls.find(
      ([message]) => message.event === 'content.checkpoint',
    )![0];
    expect(first.data.videos).toHaveLength(2);
    expect(JSON.stringify(first)).not.toMatch(/secret|private-media|private-page-text/);
    expect(response).toHaveBeenCalledWith({ ok: true });
    video.currentTime = 3;
    onMessage({ type: 'OSVSC_RECON_CHECKPOINT' }, { id: 'extid' }, response);
    await Promise.resolve();
    await Promise.resolve();
    const second = sendMessage.mock.calls.filter(
      ([message]) => message.event === 'content.checkpoint',
    )[1]![0];
    expect(second.data.videos[0].id).toBe(first.data.videos[0].id);
    expect(second.data.videos[0].progress).toBe(3);
    stop();
    stop();
    expect(
      sendMessage.mock.calls.filter(([message]) => message.event === 'content.stopped'),
    ).toHaveLength(1);
    expect(removeListener).toHaveBeenCalledWith(onMessage);
    expect(vi.getTimerCount()).toBe(0);
    sendMessage.mockClear();
    video.dispatchEvent(new Event('playing'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('acknowledges background recording only after persistence and reports receiver errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { startReconBackground } = await import('../diagnostics/recon-background');
    startReconBackground();
    const onMessage = addListener.mock.calls[0]![0];
    const response = vi.fn();
    let persist!: (response: { ok: boolean }) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          persist = resolve;
        }),
    );
    expect(
      onMessage({ type: 'OSVSC_RECON_EVENT', event: 'test', data: {} }, { id: 'extid' }, response),
    ).toBe(true);
    expect(response).not.toHaveBeenCalled();
    persist({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(response).toHaveBeenCalledWith({ ok: true });
    response.mockClear();
    fetchMock.mockRejectedValue(new Error('Receiver stopped'));
    onMessage({ type: 'OSVSC_RECON_EVENT', event: 'test', data: {} }, { id: 'extid' }, response);
    await vi.waitFor(() =>
      expect(response).toHaveBeenCalledWith({ ok: false, error: 'Receiver stopped' }),
    );
    expect(onMessage({ type: 'OSVSC_RECON_EVENT' }, { id: 'other-extension' }, response)).toBe(
      false,
    );
  });
});
