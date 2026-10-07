// SPDX-License-Identifier: GPL-3.0-only

export function classes(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

type Listener = (event: Event) => void;

export type ElementProps = {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Record<string, Listener>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) {
    node.className = props.class;
  }
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value == null || value === false) {
        continue;
      }
      if (value === true) {
        node.setAttribute(key, '');
        continue;
      }
      node.setAttribute(key, String(value));
    }
  }
  if (props.on) {
    for (const [type, listener] of Object.entries(props.on)) {
      node.addEventListener(type, listener);
    }
  }
  if (props.text != null) {
    node.textContent = props.text;
  }
  for (const child of children) {
    if (child == null || child === false) {
      continue;
    }
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
