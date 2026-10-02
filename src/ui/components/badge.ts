// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from '../dom';

const BADGE_BASE =
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap select-none [&>svg]:pointer-events-none [&>svg]:size-3';

export function badge(
  text: string,
  variant: 'secondary' | 'default' = 'secondary',
  className = '',
): HTMLSpanElement {
  return el('span', {
    class: classes(
      BADGE_BASE,
      variant === 'secondary'
        ? 'bg-secondary text-secondary-foreground'
        : 'bg-primary text-primary-foreground',
      className,
    ),
    attrs: { 'data-slot': 'badge' },
    text,
  });
}
