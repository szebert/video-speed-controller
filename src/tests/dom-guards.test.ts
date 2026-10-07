// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import {
  isDocument,
  isElement,
  isHtmlElement,
  isNode,
  isParentNode,
  isShadowRoot,
  isVideoElement,
} from '../dom/guards';
import { el } from '../ui/dom';

afterEach(() => document.body.replaceChildren());

describe('DOM guards across realms', () => {
  it('recognizes foreign nodes before and after adopting their shadow tree', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const foreign = frame.contentDocument;
    if (!foreign) {
      throw new Error('Expected an iframe document');
    }
    const host = foreign.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const video = foreign.createElement('video');
    const text = foreign.createTextNode('video');
    const svg = foreign.createElementNS('http://www.w3.org/2000/svg', 'video');
    shadow.append(video, text, svg);
    foreign.body.append(host);
    expect(shadow instanceof ShadowRoot).toBe(false);
    expect(video instanceof Node).toBe(false);
    expect(foreign instanceof Document).toBe(false);
    expect(isDocument(foreign)).toBe(true);
    for (const adopt of [false, true]) {
      if (adopt) {
        document.body.append(document.adoptNode(host));
      }
      expect(isNode(video)).toBe(true);
      expect(isNode(text)).toBe(true);
      expect(isNode(shadow)).toBe(true);
      expect(isElement(video)).toBe(true);
      expect(isElement(text)).toBe(false);
      expect(isHtmlElement(video)).toBe(true);
      expect(isHtmlElement(svg)).toBe(false);
      expect(isVideoElement(video)).toBe(true);
      expect(isVideoElement(svg)).toBe(false);
      expect(isShadowRoot(shadow)).toBe(true);
      expect(isParentNode(shadow)).toBe(true);
      expect(isParentNode(text)).toBe(false);
    }
    expect(video.ownerDocument).toBe(document);
    expect(shadow instanceof ShadowRoot).toBe(false);
    expect(el('div', {}, video).firstChild).toBe(video);
  });

  it('rejects arbitrary event targets and a document fragment with a host expando', () => {
    expect(isNode(null)).toBe(false);
    expect(isNode(undefined)).toBe(false);
    expect(isNode(window)).toBe(false);
    expect(isNode(new EventTarget())).toBe(false);
    expect(isNode({ nodeType: Node.ELEMENT_NODE })).toBe(false);
    const fragment = document.createDocumentFragment();
    Object.defineProperty(fragment, 'host', { value: document.createElement('div') });
    expect(isNode(fragment)).toBe(true);
    expect(isParentNode(fragment)).toBe(true);
    expect(isShadowRoot(fragment)).toBe(false);
    expect(isShadowRoot(null)).toBe(false);
  });
});
