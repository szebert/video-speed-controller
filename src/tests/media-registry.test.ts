// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_HOST_TAG, OVERLAY_INSET_PX, VideoOverlay } from '../core/video-overlay';
import { MediaRegistry } from '../core/media-registry';
import { OverlayView } from '../overlay/overlay-view';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import { tabBehavior } from './tab-behavior-fixture';

class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  notify(targets: Element[]): void {
    this.callback(
      targets.map((target) => ({ target }) as ResizeObserverEntry),
      this as unknown as ResizeObserver,
    );
  }
}

function installRecordingResizeObserver(): () => void {
  RecordingResizeObserver.instances = [];
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  return () => {
    globalThis.ResizeObserver = original;
  };
}

function installRafQueue(): {
  flush: () => void;
} {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  return {
    flush() {
      const callback = frames.at(-1);
      frames.length = 0;
      callback?.(0);
    },
  };
}

function setVideoRect(
  node: HTMLVideoElement,
  box: { left: number; top: number; width: number; height: number },
): void {
  node.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON() {
        return this;
      },
    }) as DOMRect;
}

function video(
  box: { left: number; top: number; width: number; height: number } = {
    left: 0,
    top: 0,
    width: 160,
    height: 90,
  },
): HTMLVideoElement {
  const node = document.createElement('video');
  setVideoRect(node, box);
  return node;
}

function capturePointerAdds(add: ReturnType<typeof vi.spyOn>): { move: number; down: number } {
  let move = 0;
  let down = 0;
  for (const [type, , options] of add.mock.calls) {
    const capture = options === true || (typeof options === 'object' && options?.capture === true);
    if (!capture) {
      continue;
    }
    if (type === 'pointermove') {
      move += 1;
    }
    if (type === 'pointerdown') {
      down += 1;
    }
  }
  return { move, down };
}

describe('media registry', () => {
  const registries: MediaRegistry[] = [];
  let restoreResizeObserver: (() => void) | undefined;

  afterEach(() => {
    for (const registry of registries.splice(0)) {
      registry.destroy();
    }
    restoreResizeObserver?.();
    restoreResizeObserver = undefined;
    document.body.replaceChildren();
    document.documentElement.querySelectorAll(OVERLAY_HOST_TAG).forEach((node) => node.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps one controller and overlay per video and applies current behavior to new videos', () => {
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video();
    const b = video();
    const c = video();
    document.body.append(a, b, c);
    registry.ensureController(a);
    registry.ensureController(b);
    registry.ensureController(c);
    registry.setBehavior(tabBehavior(2));
    expect(registry.size).toBe(3);
    expect(a.playbackRate).toBe(2);
    expect(b.playbackRate).toBe(2);
    expect(c.playbackRate).toBe(2);
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(3);

    const d = video();
    document.body.append(d);
    registry.ensureController(d);
    expect(d.playbackRate).toBe(2);
    expect(registry.getOverlay(d)?.speedReadout?.textContent).toBe('2.00×');
    registry.destroy();
    expect(a.playbackRate).toBe(1);
    expect(b.playbackRate).toBe(1);
    expect(c.playbackRate).toBe(1);
    expect(d.playbackRate).toBe(1);
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(0);
  });

  it('gives an open-shadow video its own overlay', () => {
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const node = video();
    shadow.append(node);
    document.body.append(host);
    registry['discover'](document);
    registry.setBehavior(tabBehavior(1.25));
    expect(registry.size).toBe(1);
    expect(registry.getOverlay(node)?.speedReadout?.textContent).toBe('1.25×');
  });

  it('hides the overlay immediately on surrender and shows it again on retake', () => {
    vi.useFakeTimers();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    const controller = registry.ensureController(node);
    const overlay = registry.getOverlay(node);
    registry.setBehavior(tabBehavior(3, { overlayAutoHide: false }));
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('visible');

    node.playbackRate = 1.5;
    node.dispatchEvent(new Event('ratechange'));
    for (let index = 0; index < 4; index += 1) {
      vi.runOnlyPendingTimers();
      node.playbackRate = 1.5;
      node.dispatchEvent(new Event('ratechange'));
    }
    expect(controller.surrendered).toBe(true);
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('hidden');

    registry.setBehavior(tabBehavior(2));
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('visible');
    expect(node.playbackRate).toBe(2);
  });

  it('does not retake a surrendered video on rediscovery', () => {
    vi.useFakeTimers();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    const controller = registry.ensureController(node);
    const overlay = registry.getOverlay(node);
    registry.setBehavior(tabBehavior(3, { overlayAutoHide: false }));
    overlay?.layout();

    node.playbackRate = 1.5;
    node.dispatchEvent(new Event('ratechange'));
    for (let index = 0; index < 4; index += 1) {
      vi.runOnlyPendingTimers();
      node.playbackRate = 1.5;
      node.dispatchEvent(new Event('ratechange'));
    }
    expect(controller.surrendered).toBe(true);
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('hidden');

    expect(registry.ensureController(node)).toBe(controller);
    expect(controller.surrendered).toBe(true);
    expect(node.playbackRate).toBe(1.5);
    overlay?.layout();
    expect(overlay?.host.style.visibility).toBe('hidden');
  });

  it('coalesces layout onto one animation frame', () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    const overlay = registry.getOverlay(node);
    const layout = vi.spyOn(overlay!, 'layout');
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(raf.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(layout).not.toHaveBeenCalled();
    frames.at(-1)?.(0);
    expect(layout).toHaveBeenCalledTimes(1);
  });

  it('queues exactly one follow-up RAF when layout requests work during a flush', () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    const overlay = registry.getOverlay(node);
    const original = overlay!.layout.bind(overlay);
    let layoutCalls = 0;
    overlay!.layout = ((measure?: () => DOMRect) => {
      layoutCalls += 1;
      registry['requestLayout']();
      registry['requestLayout']();
      original(measure);
    }) as VideoOverlay['layout'];
    expect(frames).toHaveLength(1);
    const scheduledBeforeFlush = raf.mock.calls.length;
    frames[0]?.(0);
    expect(layoutCalls).toBe(1);
    expect(raf.mock.calls.length).toBe(scheduledBeforeFlush + 1);
    expect(frames).toHaveLength(2);
  });

  it('does not destroy a reparented connected video', () => {
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    const source = document.createElement('div');
    const dest = document.createElement('div');
    document.body.append(source, dest);
    source.append(node);
    const controller = registry.ensureController(node);
    dest.append(node);
    registry['handleMutations']([
      {
        addedNodes: [node] as unknown as NodeList,
        removedNodes: [node] as unknown as NodeList,
        type: 'childList',
        target: source,
      } as unknown as MutationRecord,
    ]);
    expect(registry.getController(node)).toBe(controller);
    expect(registry.size).toBe(1);
    node.remove();
    registry['handleMutations']([
      {
        addedNodes: [] as unknown as NodeList,
        removedNodes: [node] as unknown as NodeList,
        type: 'childList',
        target: dest,
      } as unknown as MutationRecord,
    ]);
    expect(registry.size).toBe(0);
    registry.destroy();
  });

  it('disconnects a shadow observer when its host is gone and rediscovers on reinsert', () => {
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const node = video();
    shadow.append(node);
    document.body.append(host);
    registry['discover'](document);
    expect(registry.size).toBe(1);
    const observersBefore = registry.observerCount;
    expect(observersBefore).toBeGreaterThan(1);

    host.remove();
    registry['handleMutations']([
      {
        addedNodes: [] as unknown as NodeList,
        removedNodes: [host] as unknown as NodeList,
        type: 'childList',
        target: document.body,
      } as unknown as MutationRecord,
    ]);
    expect(registry.size).toBe(0);
    expect(registry.observerCount).toBeLessThan(observersBefore);

    document.body.append(host);
    registry['discover'](document);
    expect(registry.size).toBe(1);
    registry.destroy();
  });

  it('uses one ResizeObserver for every registered video including open shadow', () => {
    restoreResizeObserver = installRecordingResizeObserver();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video();
    const b = video();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const nested = video();
    shadow.append(nested);
    document.body.append(a, b, host);
    registry.ensureController(a);
    registry.ensureController(b);
    registry['discover'](document);
    expect(RecordingResizeObserver.instances).toHaveLength(1);
    const observer = RecordingResizeObserver.instances[0];
    expect(observer?.observed.has(a)).toBe(true);
    expect(observer?.observed.has(b)).toBe(true);
    expect(observer?.observed.has(nested)).toBe(true);
    expect(observer?.observed.size).toBe(3);
  });

  it('unobserves a removed video and leaves the other overlay intact', () => {
    restoreResizeObserver = installRecordingResizeObserver();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video();
    const b = video();
    document.body.append(a, b);
    registry.ensureController(a);
    registry.ensureController(b);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    registry.getOverlay(a)?.layout();
    registry.getOverlay(b)?.layout();
    expect(registry.getOverlay(a)?.host.style.visibility).toBe('visible');
    expect(registry.getOverlay(b)?.host.style.visibility).toBe('visible');

    a.remove();
    registry['handleMutations']([
      {
        addedNodes: [] as unknown as NodeList,
        removedNodes: [a] as unknown as NodeList,
        type: 'childList',
        target: document.body,
      } as unknown as MutationRecord,
    ]);
    const observer = RecordingResizeObserver.instances[0];
    expect(observer?.observed.has(a)).toBe(false);
    expect(observer?.observed.has(b)).toBe(true);
    expect(registry.getOverlay(a)).toBeUndefined();
    expect(registry.getOverlay(b)?.host.isConnected).toBe(true);
    expect(registry.getOverlay(b)?.host.style.visibility).toBe('visible');
  });

  it('ignores queued ResizeObserver notifications for a removed video', () => {
    restoreResizeObserver = installRecordingResizeObserver();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video();
    const b = video();
    document.body.append(a, b);
    registry.ensureController(a);
    registry.ensureController(b);
    a.remove();
    registry['handleMutations']([
      {
        addedNodes: [] as unknown as NodeList,
        removedNodes: [a] as unknown as NodeList,
        type: 'childList',
        target: document.body,
      } as unknown as MutationRecord,
    ]);
    const hostsBefore = document.querySelectorAll(OVERLAY_HOST_TAG).length;
    RecordingResizeObserver.instances[0]?.notify([a]);
    expect(registry.size).toBe(1);
    expect(registry.getOverlay(a)).toBeUndefined();
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(hostsBefore);
  });

  it('disconnects the shared ResizeObserver and cancels pending layout on destroy', () => {
    restoreResizeObserver = installRecordingResizeObserver();
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    const overlay = registry.getOverlay(node);
    const layout = vi.spyOn(overlay!, 'layout');
    window.dispatchEvent(new Event('scroll'));
    expect(frames.length).toBeGreaterThan(0);
    registry.destroy();
    expect(RecordingResizeObserver.instances[0]?.disconnected).toBe(true);
    expect(cancel).toHaveBeenCalled();
    frames.at(-1)?.(0);
    expect(layout).not.toHaveBeenCalled();
  });

  it('measures a visible video at most once per flush even if layout asks twice', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    const overlay = registry.getOverlay(node);
    const original = overlay!.layout.bind(overlay);
    overlay!.layout = ((measure?: () => DOMRect) => {
      measure?.();
      measure?.();
      original(measure);
    }) as VideoOverlay['layout'];
    const getRect = vi.spyOn(node, 'getBoundingClientRect');
    getRect.mockClear();
    raf.flush();
    expect(getRect).toHaveBeenCalledTimes(1);
    expect(overlay?.host.style.visibility).toBe('visible');
  });

  it('does not measure a cheap-hidden video during a shared flush', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const shown = video();
    const hidden = video();
    document.body.append(shown, hidden);
    registry.ensureController(shown);
    registry.ensureController(hidden);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    registry.getOverlay(hidden)?.setControlled(false);
    const shownRect = vi.spyOn(shown, 'getBoundingClientRect');
    const hiddenRect = vi.spyOn(hidden, 'getBoundingClientRect');
    raf.flush();
    expect(shownRect).toHaveBeenCalledTimes(1);
    expect(hiddenRect).not.toHaveBeenCalled();
    expect(registry.getOverlay(shown)?.host.style.visibility).toBe('visible');
    expect(registry.getOverlay(hidden)?.host.style.visibility).toBe('hidden');
  });

  it('does not read rects from setBehavior before the RAF flush', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    const getRect = vi.spyOn(node, 'getBoundingClientRect');
    const update = vi.spyOn(OverlayView.prototype, 'update');
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    expect(getRect).not.toHaveBeenCalled();
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
    raf.flush();
    expect(getRect).toHaveBeenCalledTimes(1);
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(true);
  });

  it('repositions after movement that ResizeObserver does not report', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    let box = { left: 10, top: 20, width: 200, height: 100 };
    const node = video();
    node.getBoundingClientRect = () =>
      ({
        ...box,
        right: box.left + box.width,
        bottom: box.top + box.height,
        x: box.left,
        y: box.top,
        toJSON() {
          return this;
        },
      }) as DOMRect;
    document.body.append(node);
    registry.ensureController(node);
    registry.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: false,
        overlayPosition: OVERLAY_POSITION.TOP_LEFT,
      }),
    );
    raf.flush();
    const overlay = registry.getOverlay(node);
    expect(overlay?.host.style.left).toBe(`${10 + OVERLAY_INSET_PX}px`);
    expect(overlay?.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);

    box = { left: 300, top: 40, width: 200, height: 100 };
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 320, clientY: 50 }));
    raf.flush();
    expect(overlay?.host.style.left).toBe(`${300 + OVERLAY_INSET_PX}px`);
    expect(overlay?.host.style.top).toBe(`${40 + OVERLAY_INSET_PX}px`);
  });

  it.each([1, 5, 20])('installs one window pointer listener pair for %s videos', (n) => {
    const add = vi.spyOn(window, 'addEventListener');
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    for (let index = 0; index < n; index += 1) {
      const node = video({ left: index * 200, top: 0, width: 160, height: 90 });
      document.body.append(node);
      registry.ensureController(node);
    }
    expect(capturePointerAdds(add)).toEqual({ move: 1, down: 1 });
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(n);
  });

  it('does not read geometry synchronously in pointer handlers', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    raf.flush();
    const getRect = vi.spyOn(node, 'getBoundingClientRect');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    expect(getRect).not.toHaveBeenCalled();
    raf.flush();
    expect(getRect).toHaveBeenCalledTimes(1);
  });

  it('coalesces pointer moves to the latest point in one flush', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    raf.flush();
    vi.advanceTimersByTime(200);
    raf.flush();
    expect(registry.getOverlay(node)?.host.style.visibility).toBe('hidden');
    const getRect = vi.spyOn(node, 'getBoundingClientRect');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1, clientY: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    expect(getRect).not.toHaveBeenCalled();
    raf.flush();
    expect(getRect).toHaveBeenCalledTimes(1);
    expect(registry.getOverlay(node)?.host.style.visibility).toBe('visible');
  });

  it('reveals an auto-hidden overlay in the same pointer flush', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    raf.flush();
    vi.advanceTimersByTime(200);
    raf.flush();
    expect(registry.getOverlay(node)?.host.style.visibility).toBe('hidden');
    const getRect = vi.spyOn(node, 'getBoundingClientRect');
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 30 }));
    expect(getRect).not.toHaveBeenCalled();
    raf.flush();
    expect(getRect).toHaveBeenCalledTimes(1);
    expect(registry.getOverlay(node)?.host.style.visibility).toBe('visible');
  });

  it('notifies every overlapping video from the same snapshot', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video({ left: 0, top: 0, width: 200, height: 100 });
    const b = video({ left: 50, top: 0, width: 200, height: 100 });
    document.body.append(a, b);
    registry.ensureController(a);
    registry.ensureController(b);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    raf.flush();
    vi.advanceTimersByTime(200);
    raf.flush();
    expect(registry.getOverlay(a)?.host.style.visibility).toBe('hidden');
    expect(registry.getOverlay(b)?.host.style.visibility).toBe('hidden');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 40 }));
    raf.flush();
    expect(registry.getOverlay(a)?.host.style.visibility).toBe('visible');
    expect(registry.getOverlay(b)?.host.style.visibility).toBe('visible');
  });

  it('reveals only the video under the pointer', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video({ left: 10, top: 20, width: 200, height: 100 });
    const b = video({ left: 300, top: 20, width: 200, height: 100 });
    document.body.append(a, b);
    registry.ensureController(a);
    registry.ensureController(b);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    raf.flush();
    vi.advanceTimersByTime(200);
    raf.flush();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    raf.flush();
    expect(registry.getOverlay(a)?.host.style.visibility).toBe('visible');
    expect(registry.getOverlay(b)?.host.style.visibility).toBe('hidden');
  });

  it('does not route pointer activity to a removed video', () => {
    vi.useFakeTimers();
    const raf = installRafQueue();
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const a = video({ left: 10, top: 20, width: 200, height: 100 });
    const b = video({ left: 300, top: 20, width: 200, height: 100 });
    document.body.append(a, b);
    registry.ensureController(a);
    registry.ensureController(b);
    registry.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    raf.flush();
    a.remove();
    registry['handleMutations']([
      {
        addedNodes: [] as unknown as NodeList,
        removedNodes: [a] as unknown as NodeList,
        type: 'childList',
        target: document.body,
      } as unknown as MutationRecord,
    ]);
    const getRectA = vi.spyOn(a, 'getBoundingClientRect');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    raf.flush();
    expect(registry.getOverlay(a)).toBeUndefined();
    expect(getRectA).not.toHaveBeenCalled();
    expect(registry.getOverlay(b)?.host.style.visibility).toBe('visible');
  });

  it('ignores window pointer events after destroy', () => {
    const registry = new MediaRegistry(document);
    registries.push(registry);
    registry.start();
    const node = video();
    document.body.append(node);
    registry.ensureController(node);
    registry.destroy();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(0);
    expect(registry.size).toBe(0);
  });
});
