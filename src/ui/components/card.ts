// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';

export function card(
  title: string,
  description: string,
  ...children: Array<Node | null>
): HTMLElement {
  return el(
    'div',
    {
      class:
        'flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10',
      attrs: { 'data-slot': 'card' },
    },
    el(
      'div',
      { class: 'grid gap-1 px-4', attrs: { 'data-slot': 'card-header' } },
      el('div', {
        class: 'text-base leading-snug font-medium',
        attrs: { 'data-slot': 'card-title' },
        text: title,
      }),
      el('div', {
        class: 'text-sm text-muted-foreground',
        attrs: { 'data-slot': 'card-description' },
        text: description,
      }),
    ),
    el(
      'div',
      { class: 'flex flex-col gap-4 px-4', attrs: { 'data-slot': 'card-content' } },
      ...children,
    ),
  );
}
