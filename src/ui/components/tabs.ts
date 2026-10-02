// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';
import { icon, type IconName } from '../icons';

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
          "relative inline-flex h-[calc(100%-1px)] min-w-0 flex-1 cursor-default items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm dark:text-muted-foreground dark:hover:text-foreground dark:aria-selected:border-input dark:aria-selected:bg-input/30 dark:aria-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
