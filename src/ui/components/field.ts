// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';

export function fieldGroup(...children: Array<Node | null>): HTMLDivElement {
  return el(
    'div',
    {
      class: 'flex w-full flex-col gap-5',
      attrs: { 'data-slot': 'field-group' },
    },
    ...children,
  );
}
