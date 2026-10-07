// SPDX-License-Identifier: GPL-3.0-only

// DOM getters check the platform object's brand, rather than its realm's
// prototype. Keep these optional because settings also load in the worker.
const nodeTypeGetter =
  typeof Node === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(Node.prototype, 'nodeType')?.get;
const shadowHostGetter =
  typeof ShadowRoot === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'host')?.get;

function acceptsDomGetter(value: unknown, getter: PropertyDescriptor['get']): boolean {
  if (!getter) {
    return false;
  }
  try {
    getter.call(value);
    return true;
  } catch {
    return false;
  }
}

export function isNode(value: unknown): value is Node {
  return acceptsDomGetter(value, nodeTypeGetter);
}

export function isElement(node: Node | null): node is Element {
  return node !== null && node.nodeType === Node.ELEMENT_NODE;
}

export function isDocument(node: Node | null): node is Document {
  return node !== null && node.nodeType === Node.DOCUMENT_NODE;
}

export function isShadowRoot(node: Node | null): node is ShadowRoot {
  // A DocumentFragment may have a user-defined host property. The native
  // getter distinguishes it from a real shadow root, including after adoption.
  return (
    node !== null &&
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
    acceptsDomGetter(node, shadowHostGetter)
  );
}

export function isParentNode(node: Node | null): node is Element | Document | DocumentFragment {
  return (
    isElement(node) ||
    isDocument(node) ||
    (node !== null && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
  );
}

export function isHtmlElement(node: Node | null): node is HTMLElement {
  return isElement(node) && node.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

export function isVideoElement(node: Node | null): node is HTMLVideoElement {
  return isHtmlElement(node) && node.localName === 'video';
}
