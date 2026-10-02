// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';

const INPUT_GROUP_CLASS =
  'relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent px-2 transition-colors outline-none has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-input/50 has-[:disabled]:opacity-50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/30 dark:has-[:disabled]:bg-input/80';

export function inputGroup(...children: Array<Node | null>): HTMLDivElement {
  return el(
    'div',
    {
      class: INPUT_GROUP_CLASS,
      attrs: { 'data-slot': 'input-group' },
    },
    ...children,
  );
}
