// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_HOST_TAG } from '../core/video-overlay';
import { MediaRegistry } from '../core/media-registry';
import { tabBehavior } from './tab-behavior-fixture';

function video(): HTMLVideoElement {
  const node = document.createElement('video');
  node.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 160,
      height: 90,
      right: 160,
      bottom: 90,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  return node;
}

describe('media registry', () => {
  const registries: MediaRegistry[] = [];

  afterEach(() => {
    for (const registry of registries.splice(0)) {
      registry.destroy();
    }
    document.body.replaceChildren();
    document.documentElement.querySelectorAll(OVERLAY_HOST_TAG).forEach((node) => node.remove());
    vi.useRealTimers();
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
});
