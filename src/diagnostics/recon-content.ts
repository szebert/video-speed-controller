// SPDX-License-Identifier: GPL-3.0-only

import { collectOpenShadowRoots, collectVideos } from '../core/media-registry';
import { getActiveEngine } from '../core/video-speed-engine';
import { isElement, isNode, isShadowRoot } from '../dom/guards';
import { RECON_CHECKPOINT, emitRecon, recordRecon, reconError } from './recon-transport';

function rect(element: Element): Record<string, number> {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

function describe(element: Element | null): unknown {
  if (!element) return null;
  // No text content, input values, page URLs, or page aria-labels.
  return {
    tag: element.localName,
    classes: [...element.classList].slice(0, 5),
    role: element.getAttribute('role'),
  };
}

function hitAt(x: number, y: number): Element | null {
  let hit = document.elementFromPoint(x, y);
  while (hit?.shadowRoot) {
    const deeper = hit.shadowRoot.elementFromPoint(x, y);
    if (!deeper || deeper === hit) break;
    hit = deeper;
  }
  return hit;
}

function composedContains(ancestor: Element | null, element: Element): boolean {
  let node: Node | null = element;
  while (node) {
    if (node === ancestor) return true;
    node = node.parentNode ?? (isShadowRoot(node) ? node.host : null);
  }
  return false;
}

export function startReconContent(): () => void {
  const abort = new AbortController();
  const roots = new Set<Document | ShadowRoot>();
  const videos = new Set<HTMLVideoElement>();
  const watchedVideos = new WeakSet<HTMLVideoElement>();
  const ids = new WeakMap<object, number>();
  const playbackSamples = new WeakMap<HTMLVideoElement, { at: number; time: number }>();
  let sequence = 0;
  let stopped = false;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  const reasons = new Set<string>();
  const identity = (object: object): number => {
    let id = ids.get(object);
    if (!id) {
      id = ++sequence;
      ids.set(object, id);
    }
    return id;
  };

  const snapshot = (reason: string): Record<string, unknown> => {
    discover();
    const engine = getActiveEngine();
    const behavior = engine?.registry.behavior;
    return {
      reason,
      hostname: location.hostname,
      engineActive: !!engine,
      managedVideos: engine?.registry.size ?? 0,
      fullscreen: describe(document.fullscreenElement),
      settings: behavior
        ? {
            position: behavior.overlayPosition,
            scale: behavior.overlayScale,
            visible: behavior.overlayVisible,
            autoHide: behavior.overlayAutoHide,
          }
        : null,
      videos: [...videos]
        .filter((video) => video.isConnected)
        .slice(0, 100)
        .map((video) => {
          const controller = engine?.registry.getController(video);
          const host = engine?.registry.getOverlay(video)?.host;
          const previous = playbackSamples.get(video);
          playbackSamples.set(video, { at: Date.now(), time: video.currentTime });
          const style = host ? getComputedStyle(host) : null;
          return {
            id: identity(video),
            controllerId: controller ? identity(controller) : null,
            bounds: rect(video),
            readyState: video.readyState,
            paused: video.paused,
            seeking: video.seeking,
            ended: video.ended,
            currentTime: video.currentTime,
            progress: previous ? video.currentTime - previous.time : null,
            elapsedMs: previous ? Date.now() - previous.at : null,
            playbackRate: video.playbackRate,
            targetSpeed: controller?.targetSpeed ?? null,
            retries: controller?.retryCount ?? null,
            surrendered: controller?.surrendered ?? null,
            volume: video.volume,
            muted: video.muted,
            errorCode: video.error?.code ?? null,
            overlay: host
              ? {
                  id: identity(host),
                  connected: host.isConnected,
                  bounds: rect(host),
                  visibility: style?.visibility,
                  display: style?.display,
                  opacity: style?.opacity,
                  parent: describe(host.parentElement),
                  inFullscreen: composedContains(document.fullscreenElement, host),
                  controls: [
                    ...(host.shadowRoot?.querySelectorAll('button, input, [role="slider"]') ?? []),
                  ]
                    .slice(0, 16)
                    .map((control) => {
                      const box = control.getBoundingClientRect();
                      const x = box.x + box.width / 2;
                      const y = box.y + box.height / 2;
                      const hit = hitAt(x, y);
                      return {
                        label: control.getAttribute('aria-label'),
                        bounds: rect(control),
                        hit: describe(hit),
                        controlReceivesPointer:
                          hit !== null && (hit === control || control.contains(hit)),
                      };
                    }),
                }
              : null,
          };
        }),
    };
  };

  const schedule = (reason: string): void => {
    reasons.add(reason);
    if (scheduled !== null) return;
    // Burst coalescing only. No interval, idle RAF loop, or production observer.
    scheduled = setTimeout(() => {
      scheduled = null;
      const reason = [...reasons].join(',');
      reasons.clear();
      emitRecon('content.snapshot', snapshot(reason));
    }, 250);
  };

  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === 'attributes' ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              isElement(node) &&
              (node.localName === 'video' ||
                node.localName === 'osvsc-overlay' ||
                !!node.shadowRoot ||
                !!node.querySelector('video, osvsc-overlay')),
          ),
      )
    ) {
      schedule('dom-or-overlay-change');
    }
  });

  function discover(): void {
    // Visit newly discovered open roots and listen directly to their media.
    const pending: (Document | ShadowRoot)[] = [document];
    for (let index = 0; index < pending.length; index++) {
      const root = pending[index];
      if (!root) continue;
      pending.push(...collectOpenShadowRoots(root));
      if (!roots.has(root)) {
        roots.add(root);
        observer.observe(root, { childList: true, subtree: true });
      }
      for (const video of collectVideos(root)) {
        videos.add(video);
        if (!watchedVideos.has(video)) {
          watchedVideos.add(video);
          for (const type of [
            'playing',
            'pause',
            'waiting',
            'stalled',
            'error',
            'loadedmetadata',
            'emptied',
            'ratechange',
            'volumechange',
          ]) {
            video.addEventListener(type, () => schedule(`media:${type}`), { signal: abort.signal });
          }
          let sampledAt = 0;
          video.addEventListener(
            'timeupdate',
            () => {
              if (Date.now() - sampledAt >= 5000) {
                sampledAt = Date.now();
                schedule('media:progress');
              }
            },
            { signal: abort.signal },
          );
        }
        const host = getActiveEngine()?.registry.getOverlay(video)?.host;
        if (host)
          observer.observe(host, {
            attributes: true,
            attributeFilter: ['style', 'hidden', 'class'],
          });
      }
    }
    for (const video of videos) if (!video.isConnected) videos.delete(video);
  }

  for (const type of ['scroll', 'fullscreenchange', 'fullscreenerror', 'visibilitychange']) {
    document.addEventListener(type, () => schedule(type), { capture: true, signal: abort.signal });
  }
  window.addEventListener('resize', () => schedule('resize'), { signal: abort.signal });
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted) return;
      const path = event.composedPath().filter(isNode).filter(isElement);
      const overlay = path.find((element) => element.localName === 'osvsc-overlay');
      emitRecon('content.click', {
        hostname: location.hostname,
        x: event.clientX,
        y: event.clientY,
        target: describe(path[0] ?? null),
        overlay: !!overlay,
        control: overlay
          ? path
              .slice(0, path.indexOf(overlay))
              .find((element) => element.hasAttribute('aria-label'))
              ?.getAttribute('aria-label')
          : null,
        hit: describe(hitAt(event.clientX, event.clientY)),
      });
      schedule('click');
    },
    { capture: true, signal: abort.signal },
  );

  const onMessage = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean => {
    if (
      sender.id !== chrome.runtime.id ||
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      message.type !== RECON_CHECKPOINT
    )
      return false;
    void (async () => {
      try {
        await recordRecon('content.checkpoint', snapshot('operator-checkpoint'));
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: reconError(error) });
      }
    })();
    return true;
  };
  chrome.runtime.onMessage.addListener(onMessage);
  schedule('content-ready');
  return () => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    observer.disconnect();
    if (scheduled !== null) clearTimeout(scheduled);
    chrome.runtime.onMessage.removeListener(onMessage);
    emitRecon('content.stopped', { hostname: location.hostname });
  };
}
