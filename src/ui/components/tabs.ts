// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';
import { icon, type IconName } from '../icons';

export type TabSpec = {
  id: string;
  label: string;
  icon?: IconName;
  panel: HTMLElement;
};

type TabOrientation = 'horizontal' | 'vertical';

const ROOT_CLASS = 'group/tabs flex w-full min-w-0 flex-col gap-4';
const LIST_CLASS =
  'flex w-full min-w-0 max-w-full items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col';
const TRIGGER_CLASS =
  "relative inline-flex min-w-0 cursor-default items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=horizontal]/tabs:h-[calc(100%-1px)] group-data-[orientation=horizontal]/tabs:flex-1 group-data-[orientation=horizontal]/tabs:justify-center group-data-[orientation=vertical]/tabs:h-8 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:flex-none group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm dark:text-muted-foreground dark:hover:text-foreground dark:aria-selected:border-input dark:aria-selected:bg-input/30 dark:aria-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
const PANELS_CLASS = 'min-w-0';

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function horizontalEdge(style: CSSStyleDeclaration): number {
  return (
    px(style.paddingLeft) +
    px(style.paddingRight) +
    px(style.borderLeftWidth) +
    px(style.borderRightWidth)
  );
}

/** Width of the tab labels laid out in one row, independent of the current orientation. */
function measureHorizontalTabsWidth(
  list: HTMLElement,
  buttons: readonly HTMLButtonElement[],
): number {
  if (buttons.length === 0) {
    return 0;
  }
  const probe = document.createElement('div');
  probe.setAttribute('data-tab-measure', 'horizontal');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'fixed';
  probe.style.left = '0';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.display = 'flex';
  probe.style.flexWrap = 'nowrap';
  probe.style.width = 'max-content';
  const listStyle = getComputedStyle(list);
  probe.style.columnGap = listStyle.columnGap;
  for (const button of buttons) {
    const clone = button.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      continue;
    }
    clone.removeAttribute('id');
    clone.style.flex = '0 0 auto';
    clone.style.width = 'max-content';
    probe.append(clone);
  }
  document.body.append(probe);
  try {
    return Math.ceil(probe.getBoundingClientRect().width + horizontalEdge(listStyle));
  } finally {
    probe.remove();
  }
}

function tabOrientationForWidth(availableWidth: number, horizontalWidth: number): TabOrientation {
  if (!(availableWidth > 0) || !(horizontalWidth > 0)) {
    return 'horizontal';
  }
  return horizontalWidth > availableWidth ? 'vertical' : 'horizontal';
}

export function createTabs(options: {
  label: string;
  tabs: TabSpec[];
  initialId?: string;
  signal?: AbortSignal;
}): HTMLDivElement {
  let selected = options.initialId ?? options.tabs[0]?.id ?? '';
  const signal = options.signal;
  const tabButtons: HTMLButtonElement[] = [];
  const list = el('div', {
    class: LIST_CLASS,
    attrs: {
      role: 'tablist',
      'aria-label': options.label,
      'aria-orientation': 'horizontal',
      'data-slot': 'tabs-list',
    },
  });
  const panels = el('div', { class: PANELS_CLASS });
  for (const tab of options.tabs) {
    const button = el(
      'button',
      {
        class: TRIGGER_CLASS,
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

  const root = el(
    'div',
    {
      class: ROOT_CLASS,
      attrs: { 'data-orientation': 'horizontal', 'data-slot': 'tabs' },
    },
    list,
    panels,
  );

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

  const orientation = (): TabOrientation =>
    root.getAttribute('data-orientation') === 'vertical' ? 'vertical' : 'horizontal';

  const applyOrientation = (next: TabOrientation): void => {
    if (orientation() === next) {
      return;
    }
    root.setAttribute('data-orientation', next);
    list.setAttribute('aria-orientation', next);
  };

  const syncOrientation = (): void => {
    if (signal?.aborted) {
      return;
    }
    applyOrientation(
      tabOrientationForWidth(root.clientWidth, measureHorizontalTabsWidth(list, tabButtons)),
    );
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
    const vertical = orientation() === 'vertical';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    let next: number;
    if (event.key === nextKey) {
      next = (index + 1) % tabButtons.length;
    } else if (event.key === previousKey) {
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

  if (!signal?.aborted) {
    const observer = new ResizeObserver(() => {
      syncOrientation();
    });
    observer.observe(root);
    const stop = (): void => {
      observer.disconnect();
    };
    signal?.addEventListener('abort', stop, { once: true });
    queueMicrotask(() => {
      if (signal?.aborted || !root.isConnected) {
        return;
      }
      syncOrientation();
    });
  }
  return root;
}
