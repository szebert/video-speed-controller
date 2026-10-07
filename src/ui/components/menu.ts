// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';
import { icon, type IconName } from '../icons';
import { button } from './button';

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
            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-sm outline-none focus-visible:bg-accent focus-visible:text-accent-foreground',
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
    const active = document.activeElement;
    const index = active instanceof HTMLButtonElement ? items.indexOf(active) : -1;
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
      if (document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.click();
      }
    }
  });
  options.signal?.addEventListener('abort', () => {
    stopOutside();
    open = false;
  });

  return root;
}
