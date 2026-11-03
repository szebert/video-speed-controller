// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAttachShadowHook, SHADOW_ATTACHED_EVENT } from '../core/shadow-attach';

describe('installAttachShadowHook', () => {
  const nativeAttachShadow = Element.prototype.attachShadow;
  let listeners: AbortController;

  beforeEach(() => {
    listeners = new AbortController();
  });

  afterEach(() => {
    listeners.abort();
    Element.prototype.attachShadow = nativeAttachShadow;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports the element that attached a shadow and still returns that root', () => {
    installAttachShadowHook();
    const wrapped = Element.prototype.attachShadow;
    installAttachShadowHook();
    expect(Element.prototype.attachShadow).toBe(wrapped);
    const host = document.createElement('div');
    const seen: EventTarget[] = [];
    document.addEventListener(
      SHADOW_ATTACHED_EVENT,
      (event) => {
        if (event.target) {
          seen.push(event.target);
        }
      },
      { capture: true, signal: listeners.signal },
    );
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const video = document.createElement('video');
    shadow.append(video);
    expect(seen).toEqual([host]);
    expect(host.shadowRoot).toBe(shadow);
    expect(shadow.querySelector('video')).toBe(video);
  });

  it('installs from its own source, the form executeScript sends to the page', () => {
    expect(installAttachShadowHook.toString()).toContain(SHADOW_ATTACHED_EVENT);
    const install = new Function(`return (${installAttachShadowHook.toString()})`)() as () => void;
    expect(() => {
      install();
    }).not.toThrow();
    const host = document.createElement('div');
    expect(host.attachShadow({ mode: 'open' })).toBe(host.shadowRoot);
  });

  it('uses captured event primitives instead of a component dispatch override', () => {
    installAttachShadowHook();
    const host = document.createElement('section');
    const overriddenDispatch = vi.spyOn(host, 'dispatchEvent').mockImplementation(() => {
      throw new Error('component dispatch override');
    });
    vi.stubGlobal(
      'CustomEvent',
      class {
        constructor() {
          throw new Error('page replaced CustomEvent');
        }
      },
    );
    const seen = vi.fn();
    document.addEventListener(SHADOW_ATTACHED_EVENT, seen, { signal: listeners.signal });
    document.body.append(host);

    const shadow = host.attachShadow({ mode: 'open' });
    expect(shadow).toBe(host.shadowRoot);
    expect(overriddenDispatch).not.toHaveBeenCalled();
    expect(seen).toHaveBeenCalledOnce();
  });

  it('returns the new root even if the captured notification dispatch fails', () => {
    const dispatch = vi.spyOn(EventTarget.prototype, 'dispatchEvent').mockImplementation(() => {
      throw new Error('notification failed');
    });
    installAttachShadowHook();
    dispatch.mockRestore();

    const host = document.createElement('div');
    expect(host.attachShadow({ mode: 'open' })).toBe(host.shadowRoot);
  });

  it('preserves native attachShadow failures without notifying a second attachment', () => {
    installAttachShadowHook();
    const host = document.createElement('div');
    const seen = vi.fn();
    host.addEventListener(SHADOW_ATTACHED_EVENT, seen);
    host.attachShadow({ mode: 'closed' });

    expect(() => host.attachShadow({ mode: 'closed' })).toThrow(DOMException);
    expect(seen).toHaveBeenCalledOnce();
  });
});
