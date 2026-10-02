// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from './dom';
import { icon, type IconName } from './icons';

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const BUTTON_VARIANT = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/80',
  outline:
    'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost:
    'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
  destructive:
    'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
} as const;

const BUTTON_SIZE = {
  default: 'h-8 gap-1.5 px-2.5',
  sm: 'h-7 gap-1 rounded-md px-2.5 text-[0.8rem]',
  icon: 'size-8',
  'icon-sm': 'size-7 rounded-md',
  'icon-xs': 'size-6 rounded-md [&_svg]:size-3',
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

const SWITCH_CLASS =
  'peer relative inline-flex h-[18.4px] w-[32px] shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 after:content-[""] data-selected:bg-primary data-unchecked:bg-input has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50';

export function switchControl(options: {
  id?: string;
  labelledBy?: string;
  describedBy?: string;
  checked?: boolean;
  disabled?: boolean;
  class?: string;
  name?: string;
  onChange?: (checked: boolean) => void;
}): HTMLInputElement {
  const input = el('input', {
    class: 'sr-only',
    attrs: {
      type: 'checkbox',
      role: 'switch',
      id: options.id,
      name: options.name,
      'aria-labelledby': options.labelledBy,
      'aria-describedby': options.describedBy,
    },
  });
  input.checked = Boolean(options.checked);
  input.disabled = Boolean(options.disabled);
  const thumb = el('span', {
    class:
      'pointer-events-none block size-4 rounded-full bg-background transition-transform translate-x-0 data-checked:translate-x-[calc(100%-2px)]',
    attrs: { 'data-slot': 'switch-thumb' },
  });
  const shell = el(
    'label',
    {
      class: classes(SWITCH_CLASS, options.class),
      attrs: { 'data-slot': 'switch', 'data-size': 'default' },
    },
    input,
    thumb,
  );
  const paint = (): void => {
    shell.toggleAttribute('data-selected', input.checked);
    shell.toggleAttribute('data-unchecked', !input.checked);
    shell.toggleAttribute('data-disabled', input.disabled);
    thumb.toggleAttribute('data-checked', input.checked);
    thumb.toggleAttribute('data-selected', input.checked);
  };
  paint();
  input.addEventListener('change', () => {
    paint();
    options.onChange?.(input.checked);
  });
  return input;
}

export function syncSwitch(input: HTMLInputElement, checked: boolean, disabled: boolean): void {
  input.checked = checked;
  input.disabled = disabled;
  input.dispatchEvent(new Event('sync-switch'));
  const shell = input.closest('[data-slot="switch"]');
  const thumb = shell?.querySelector('[data-slot="switch-thumb"]');
  shell?.toggleAttribute('data-selected', checked);
  shell?.toggleAttribute('data-unchecked', !checked);
  shell?.toggleAttribute('data-disabled', disabled);
  thumb?.toggleAttribute('data-checked', checked);
  thumb?.toggleAttribute('data-selected', checked);
}

export function rangeControl(options: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onInput?: (value: number) => void;
  onCommit?: (value: number) => void;
}): HTMLDivElement {
  const input = el('input', {
    class:
      'absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed',
    attrs: {
      type: 'range',
      min: options.min,
      max: options.max,
      step: options.step,
      'aria-label': options.label,
    },
  });
  input.value = String(options.value);
  input.disabled = Boolean(options.disabled);
  const fill = el('div', {
    class: 'absolute inset-y-0 start-0 bg-primary',
    attrs: { 'data-slot': 'slider-range' },
  });
  const track = el(
    'div',
    {
      class: 'relative h-1 w-full grow overflow-hidden rounded-full bg-muted',
      attrs: { 'data-slot': 'slider-track' },
    },
    fill,
  );
  const thumb = el('div', {
    class:
      'pointer-events-none absolute top-1/2 size-3 -translate-y-1/2 rounded-full border border-ring bg-white ring-ring/50',
    attrs: { 'data-slot': 'slider-thumb' },
  });
  const root = el(
    'div',
    {
      class: classes(
        'relative flex h-7 w-full touch-none items-center select-none has-[input:hover]:[&_[data-slot=slider-thumb]]:ring-3 has-[input:active]:[&_[data-slot=slider-thumb]]:ring-3 has-[input:focus-visible]:[&_[data-slot=slider-thumb]]:ring-3',
        options.disabled && 'opacity-50',
      ),
      attrs: {
        'data-slot': 'slider',
        'aria-label': options.label,
        'data-disabled': options.disabled ? 'true' : null,
      },
    },
    track,
    thumb,
    input,
  );
  const paint = (): void => {
    paintRange(root);
  };
  const emitInput = (): void => {
    paint();
    options.onInput?.(Number(input.value));
  };
  const stepBy = (direction: 1 | -1 | 'min' | 'max'): void => {
    const min = Number(input.min);
    const max = Number(input.max);
    const step = Number(input.step) || 1;
    const current = Number(input.value);
    const next = direction === 'min' ? min : direction === 'max' ? max : current + direction * step;
    input.value = String(Math.min(max, Math.max(min, next)));
    emitInput();
    options.onCommit?.(Number(input.value));
  };
  input.addEventListener('input', emitInput);
  input.addEventListener('change', () => {
    options.onCommit?.(Number(input.value));
  });
  root.addEventListener('keydown', (event) => {
    if (input.disabled) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      stepBy('min');
    } else if (event.key === 'End') {
      event.preventDefault();
      stepBy('max');
    }
  });
  paint();
  return root;
}

export function paintRange(root: HTMLElement): void {
  const input = root.querySelector('input[type="range"]');
  const fill = root.querySelector('[data-slot="slider-range"]');
  const thumb = root.querySelector('[data-slot="slider-thumb"]');
  if (!(input instanceof HTMLInputElement) || !(fill instanceof HTMLElement)) {
    return;
  }
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const span = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / span));
  fill.style.width = `${ratio * 100}%`;
  if (thumb instanceof HTMLElement) {
    thumb.style.left = `calc(${ratio * 100}% - 6px)`;
  }
}

export function syncRange(root: HTMLElement, value: number, disabled: boolean): void {
  const input = root.querySelector('input[type="range"]');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  if (document.activeElement !== input) {
    input.value = String(value);
  }
  input.disabled = disabled;
  root.toggleAttribute('data-disabled', disabled);
  root.classList.toggle('opacity-50', disabled);
  paintRange(root);
}

const BADGE_BASE =
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap';

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

export function showModal(dialog: HTMLDialogElement): void {
  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute('open', '');
  }
}

export function openConfirmDialog(options: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  const previouslyFocused = document.activeElement;
  const titleId = `dialog-title-${crypto.randomUUID()}`;
  const descriptionId = `dialog-description-${crypto.randomUUID()}`;
  const cancel = button(options.cancelLabel, { variant: 'outline' });
  const confirm = button(options.confirmLabel, {
    variant: options.destructive === false ? 'default' : 'destructive',
  });
  const dialog = el(
    'dialog',
    {
      class:
        'm-auto h-fit w-full max-w-sm rounded-xl border-0 bg-popover p-4 text-sm text-popover-foreground shadow-lg backdrop:bg-black/10',
      attrs: {
        'data-slot': 'dialog',
        'aria-labelledby': titleId,
        'aria-describedby': descriptionId,
      },
    },
    el('h2', { class: 'text-base font-semibold', attrs: { id: titleId }, text: options.title }),
    el('p', {
      class: 'mt-1 text-sm text-muted-foreground',
      attrs: { id: descriptionId },
      text: options.description,
    }),
    el('div', { class: 'mt-4 flex justify-end gap-2' }, cancel, confirm),
  );
  let settled = false;
  const finish = (confirmed: boolean): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    dialog.remove();
    if (confirmed) {
      options.onConfirm();
    }
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
  };
  cancel.addEventListener('click', () => finish(false));
  confirm.addEventListener('click', () => finish(true));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish(false);
  });
  dialog.addEventListener('close', () => {
    finish(false);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) {
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const inside =
      rect.top <= event.clientY &&
      event.clientY <= rect.bottom &&
      rect.left <= event.clientX &&
      event.clientX <= rect.right;
    if (inside) {
      return;
    }
    finish(false);
  });
  dialog.setAttribute('closedby', 'any');
  document.body.append(dialog);
  showModal(dialog);
  cancel.focus();
}

export type MenuItem = {
  id: string;
  label: string;
  icon?: IconName;
  checked?: boolean;
};

export const RADIO_CHOICE_CLASS =
  'outline-none has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50';

export function createMenuButton(options: {
  label: string;
  icon: IconName;
  items: () => MenuItem[];
  onSelect: (id: string) => void;
  signal?: AbortSignal;
}): HTMLDivElement {
  const trigger = button(null, {
    variant: 'ghost',
    size: 'icon',
    icon: options.icon,
    attrs: {
      'aria-label': options.label,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    },
  });
  const menu = el('div', {
    class:
      'absolute end-0 top-full z-50 mt-1 hidden min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10',
    attrs: { role: 'menu', 'aria-label': options.label },
  });
  const root = el('div', { class: 'relative' }, trigger, menu);
  let open = false;
  let items: HTMLButtonElement[] = [];
  let outside: ((event: PointerEvent) => void) | null = null;

  const stopOutside = (): void => {
    if (!outside) {
      return;
    }
    document.removeEventListener('pointerdown', outside);
    outside = null;
  };

  const startOutside = (): void => {
    if (outside) {
      return;
    }
    outside = (event: PointerEvent): void => {
      if (!open) {
        return;
      }
      if (event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      close(false);
    };
    document.addEventListener('pointerdown', outside);
  };

  const focusItem = (index: number): void => {
    const item = items[index];
    if (!item) {
      return;
    }
    for (const candidate of items) {
      candidate.tabIndex = candidate === item ? 0 : -1;
    }
    item.focus();
  };

  const close = (restoreFocus: boolean): void => {
    stopOutside();
    if (!open) {
      return;
    }
    open = false;
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      trigger.focus();
    }
  };

  const renderItems = (): void => {
    menu.replaceChildren();
    items = options.items().map((item, index) => {
      const node = el(
        'button',
        {
          class:
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm outline-none focus-visible:bg-foreground/10',
          attrs: {
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': item.checked ? 'true' : 'false',
            tabindex: index === 0 ? '0' : '-1',
          },
        },
        item.icon ? icon(item.icon, 'size-4') : null,
        item.label,
      );
      node.addEventListener('click', () => {
        options.onSelect(item.id);
        close(true);
      });
      menu.append(node);
      return node;
    });
  };

  const openMenu = (focus: 'first' | 'last'): void => {
    renderItems();
    open = true;
    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    startOutside();
    focusItem(focus === 'first' ? 0 : items.length - 1);
  };

  trigger.addEventListener('click', () => {
    if (open) {
      close(false);
      return;
    }
    openMenu('first');
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu('last');
    } else if ((event.key === 'Enter' || event.key === ' ') && !open) {
      event.preventDefault();
      openMenu('first');
    }
  });
  menu.addEventListener('keydown', (event) => {
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem((index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem((index - 1 + items.length) % items.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      (document.activeElement as HTMLButtonElement | null)?.click();
    }
  });
  options.signal?.addEventListener('abort', () => {
    stopOutside();
    open = false;
  });

  return root;
}

export type TabSpec = {
  id: string;
  label: string;
  icon?: IconName;
  panel: HTMLElement;
};

export function createTabs(options: {
  label: string;
  tabs: TabSpec[];
  initialId?: string;
}): HTMLDivElement {
  let selected = options.initialId ?? options.tabs[0]?.id ?? '';
  const tabButtons: HTMLButtonElement[] = [];
  const list = el('div', {
    class:
      'flex h-8 w-full min-w-0 max-w-full items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground',
    attrs: { role: 'tablist', 'aria-label': options.label, 'data-slot': 'tabs-list' },
  });
  const panels = el('div', { class: 'min-w-0' });
  for (const tab of options.tabs) {
    const button = el(
      'button',
      {
        class:
          "relative inline-flex h-[calc(100%-1px)] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm dark:aria-selected:border-input dark:aria-selected:bg-input/30 dark:aria-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        attrs: {
          type: 'button',
          role: 'tab',
          id: `tab-${tab.id}`,
          'aria-controls': `panel-${tab.id}`,
          'data-slot': 'tabs-trigger',
        },
      },
      tab.icon ? icon(tab.icon, 'size-4') : null,
      tab.label,
    );
    tab.panel.id = `panel-${tab.id}`;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', button.id);
    tab.panel.setAttribute('data-slot', 'tabs-content');
    tabButtons.push(button);
    list.append(button);
    panels.append(tab.panel);
  }

  const paint = (moveFocus: boolean): void => {
    tabButtons.forEach((button, index) => {
      const tab = options.tabs[index];
      const active = tab?.id === selected;
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
      const panel = tab?.panel;
      if (panel) {
        panel.hidden = !active;
      }
      if (active && moveFocus) {
        button.focus();
      }
    });
  };

  const select = (id: string, moveFocus: boolean): void => {
    selected = id;
    paint(moveFocus);
  };

  list.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const id = target.getAttribute('aria-controls')?.replace(/^panel-/, '');
    if (id) {
      select(id, false);
    }
  });
  list.addEventListener('keydown', (event) => {
    const index = tabButtons.findIndex((button) => button.getAttribute('aria-selected') === 'true');
    if (index < 0) {
      return;
    }
    let next: number;
    if (event.key === 'ArrowRight') {
      next = (index + 1) % tabButtons.length;
    } else if (event.key === 'ArrowLeft') {
      next = (index - 1 + tabButtons.length) % tabButtons.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = tabButtons.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const id = options.tabs[next]?.id;
    if (id) {
      select(id, true);
    }
  });
  paint(false);
  return el('div', { class: 'flex w-full min-w-0 flex-col gap-4' }, list, panels);
}
