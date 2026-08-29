// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { MediaRegistry } from '../core/media-registry';

function video(): HTMLVideoElement {
  return document.createElement('video');
}

describe('media registry', () => {
  const registries: MediaRegistry[] = [];

  afterEach(() => {
    for (const registry of registries.splice(0)) {
      registry.destroy();
    }
    document.body.replaceChildren();
  });

  it('keeps one controller per video and applies the current target to new videos', () => {
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
    registry.setTarget(2);
    expect(registry.size).toBe(3);
    expect(a.playbackRate).toBe(2);
    expect(b.playbackRate).toBe(2);
    expect(c.playbackRate).toBe(2);

    const d = video();
    document.body.append(d);
    registry.ensureController(d);
    expect(d.playbackRate).toBe(2);
    registry.destroy();
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
