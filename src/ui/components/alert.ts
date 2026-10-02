// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from '../dom';
import { icon } from '../icons';

const ALERT_CLASS =
  "relative grid w-full items-start gap-0.5 rounded-lg border px-2.5 py-2 text-start text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:self-start *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4";

export function infoAlert(title: string, description: string): HTMLElement {
  return el(
    'div',
    {
      class: classes(ALERT_CLASS, 'bg-card text-card-foreground'),
      attrs: { role: 'alert', 'data-slot': 'alert' },
    },
    icon('info'),
    el('div', {
      class: 'col-start-2 font-medium',
      attrs: { 'data-slot': 'alert-title' },
      text: title,
    }),
    el('div', {
      class: 'col-start-2 text-sm text-balance text-muted-foreground',
      attrs: { 'data-slot': 'alert-description' },
      text: description,
    }),
  );
}

export function destructiveAlert(title: string, description: string): HTMLElement {
  return el(
    'div',
    {
      class: classes(ALERT_CLASS, 'bg-card text-destructive'),
      attrs: { role: 'alert', 'data-slot': 'alert' },
    },
    icon('circle-alert'),
    el('div', {
      class: 'col-start-2 font-medium',
      attrs: { 'data-slot': 'alert-title' },
      text: title,
    }),
    el('div', {
      class: 'col-start-2 text-sm text-balance text-destructive/90',
      attrs: { 'data-slot': 'alert-description' },
      text: description,
    }),
  );
}
