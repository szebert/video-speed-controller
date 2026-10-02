// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from '../dom';

const SWITCH_CLASS =
  'peer relative inline-flex h-[18.4px] w-[32px] shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 after:content-[""] data-selected:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50';

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
      'pointer-events-none block size-4 translate-x-0 rounded-full bg-background transition-transform data-checked:translate-x-[calc(100%-2px)] dark:data-selected:bg-primary-foreground dark:not-data-selected:bg-foreground',
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
