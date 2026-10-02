// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from '../dom';

const BUTTON_GROUP_CLASS =
  'flex items-stretch *:focus-visible:relative *:focus-visible:z-10 [&>[data-slot=button]]:rounded-e-none [&>[data-slot=button]+[data-slot=button]]:rounded-s-none [&>[data-slot=button]+[data-slot=button]]:border-s-0 [&>[data-slot=button]:last-child]:rounded-e-lg!';

export function buttonGroup(
  options: { label?: string; full?: boolean; class?: string } = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLDivElement {
  return el(
    'div',
    {
      class: classes(
        BUTTON_GROUP_CLASS,
        options.full ? 'w-full [&>[data-slot=button]]:flex-1' : 'w-fit',
        options.class,
      ),
      attrs: {
        role: 'group',
        'data-slot': 'button-group',
        'data-orientation': 'horizontal',
        'aria-label': options.label,
      },
    },
    ...children,
  );
}
