// SPDX-License-Identifier: GPL-3.0-only

import { el } from '../dom';
import { button } from './button';

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
        'm-auto h-fit w-full max-w-sm rounded-xl border-0 bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 backdrop:bg-black/10 supports-backdrop-filter:backdrop:backdrop-blur-xs',
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
    el(
      'div',
      {
        class: '-mx-4 -mb-4 mt-4 flex justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4',
        attrs: { 'data-slot': 'dialog-footer' },
      },
      cancel,
      confirm,
    ),
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
