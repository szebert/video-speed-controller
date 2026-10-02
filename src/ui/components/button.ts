// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from '../dom';
import { icon, type IconName } from '../icons';

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const BUTTON_VARIANT = {
  default: 'border-transparent bg-primary text-primary-foreground enabled:hover:bg-primary/80',
  outline:
    'border-border bg-background enabled:hover:bg-muted enabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:enabled:hover:bg-input/50',
  secondary:
    'border-transparent bg-secondary text-secondary-foreground enabled:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
  ghost:
    'border-transparent enabled:hover:bg-muted enabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:enabled:hover:bg-muted/50',
  destructive:
    'border-transparent bg-destructive/10 text-destructive enabled:hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:enabled:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
} as const;

const BUTTON_SIZE = {
  default: 'h-8 gap-1.5 rounded-lg px-2.5',
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
  icon: 'size-8 rounded-lg',
  'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
  'icon-xs':
    'size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg]:size-3',
  'icon-2xs': 'size-4 rounded-full p-0 [&_svg]:size-3',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

export function button(
  label: string | null,
  options: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
    icon?: IconName;
    attrs?: Record<string, string | number | boolean | null | undefined>;
    disabled?: boolean;
    onClick?: () => void;
  } = {},
): HTMLButtonElement {
  const node = el(
    'button',
    {
      class: classes(
        BUTTON_BASE,
        BUTTON_VARIANT[options.variant ?? 'default'],
        BUTTON_SIZE[options.size ?? 'default'],
        options.class,
      ),
      attrs: {
        type: 'button',
        'data-slot': 'button',
        'data-variant': options.variant ?? 'default',
        ...options.attrs,
      },
      on: options.onClick ? { click: () => options.onClick?.() } : undefined,
    },
    options.icon ? icon(options.icon) : null,
    label,
  );
  node.disabled = Boolean(options.disabled);
  return node;
}

export function paintButton(
  node: HTMLButtonElement,
  options: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
    icon?: IconName;
    disabled?: boolean;
    current?: boolean;
    pressed?: boolean;
    label?: string;
  },
): void {
  node.className = classes(
    BUTTON_BASE,
    BUTTON_VARIANT[options.variant ?? 'default'],
    BUTTON_SIZE[options.size ?? 'default'],
    options.class,
  );
  node.dataset.variant = options.variant ?? 'default';
  node.disabled = Boolean(options.disabled);
  if (options.current != null) {
    if (options.current) {
      node.setAttribute('aria-current', 'page');
    } else {
      node.removeAttribute('aria-current');
    }
  }
  if (options.pressed != null) {
    node.setAttribute('aria-pressed', options.pressed ? 'true' : 'false');
  }
  if (options.label != null) {
    node.setAttribute('aria-label', options.label);
  }
  if (options.icon) {
    const next = icon(options.icon);
    const existing = node.querySelector('svg');
    if (existing) {
      existing.replaceWith(next);
    } else {
      node.prepend(next);
    }
  }
}
