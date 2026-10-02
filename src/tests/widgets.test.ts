// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMenuButton, openConfirmDialog, rangeControl, switchControl } from '../ui/widgets';

function rect(box: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>): DOMRect {
  return {
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON() {
      return {};
    },
  };
}

describe('shared widgets', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('keeps a slider drag target at least 28px tall and rings the thumb on focus-visible', () => {
    const root = rangeControl({
      label: 'Default speed',
      min: 0.25,
      max: 4,
      step: 0.01,
      value: 1,
    });
    expect(root.className).toContain('h-7');
    expect(root.className).toContain(
      'has-[input:focus-visible]:[&_[data-slot=slider-thumb]]:ring-3',
    );
    const input = root.querySelector('input');
    expect(input?.className).toContain('inset-0');
    expect(input?.className).toContain('h-full');
  });

  it('gives the switch an enlarged hit area and a keyboard focus ring', () => {
    const input = switchControl({ checked: false });
    const shell = input.parentElement;
    expect(shell?.className).toContain('after:-inset-x-3');
    expect(shell?.className).toContain('after:-inset-y-2');
    expect(shell?.className).toContain('has-[:focus-visible]:ring-3');
  });

  it('listens for outside pointer events only while a menu is open', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const root = createMenuButton({
      label: 'Change theme',
      icon: 'moon',
      items: () => [{ id: 'dark', label: 'Dark', checked: true }],
      onSelect: () => undefined,
    });
    document.body.append(root);
    const trigger = root.querySelector('button');
    expect(trigger).toBeInstanceOf(HTMLButtonElement);
    if (!(trigger instanceof HTMLButtonElement)) {
      return;
    }
    expect(add.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(0);
    trigger.click();
    expect(add.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
    trigger.click();
    expect(remove.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
  });

  it('removes an open menu listener when its owner signal aborts', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const owner = new AbortController();
    const root = createMenuButton({
      label: 'Change theme',
      icon: 'moon',
      items: () => [{ id: 'dark', label: 'Dark', checked: true }],
      onSelect: () => undefined,
      signal: owner.signal,
    });
    document.body.append(root);
    root.querySelector('button')?.click();
    owner.abort();
    expect(remove.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
  });

  it('dismisses a confirm dialog from the backdrop and not from its own padding', () => {
    const onConfirm = vi.fn();
    openConfirmDialog({
      title: 'Reset defaults',
      description: 'Restore the built-in defaults?',
      cancelLabel: 'Cancel',
      confirmLabel: 'Reset',
      onConfirm,
    });
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeInstanceOf(HTMLDialogElement);
    if (!(dialog instanceof HTMLDialogElement)) {
      return;
    }
    dialog.getBoundingClientRect = () => rect({ top: 100, left: 80, width: 240, height: 140 });
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 120 }));
    expect(dialog.isConnected).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 8, clientY: 8 }));
    expect(dialog.isConnected).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
