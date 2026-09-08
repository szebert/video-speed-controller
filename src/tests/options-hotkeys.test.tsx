// SPDX-License-Identifier: GPL-3.0-only

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HotkeysSettingsCard,
  hotkeyConflictMessage,
  hotkeyShadowedMessage,
} from '../entrypoints/options/HotkeysSettingsCard';
import { BUILT_IN_HOTKEYS } from '../settings/hotkey-binding';
import { resolveSiteBehavior, type HotkeySettingChange } from '../settings/site-behavior';

function keydown(
  code: string,
  extras: KeyboardEventInit & { altGraph?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    code,
    key: extras.key ?? code,
    ctrlKey: extras.ctrlKey,
    altKey: extras.altKey,
    shiftKey: extras.shiftKey,
    metaKey: extras.metaKey,
    bubbles: true,
    cancelable: true,
  });
  if (extras.altGraph) {
    Object.defineProperty(event, 'getModifierState', {
      value: (name: string) => name === 'AltGraph',
    });
  }
  return event;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe('Hotkeys settings card', () => {
  let root: Root | null = null;
  let container: HTMLElement;

  async function renderCard(
    onMutate: (change: HotkeySettingChange) => void,
    hotkeys = resolveSiteBehavior().hotkeys,
    selection: { kind: 'global' } | { kind: 'site'; hostname: string } = { kind: 'global' },
  ): Promise<void> {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <HotkeysSettingsCard
          selection={selection}
          hotkeys={hotkeys}
          pending={false}
          resetBadgeText={selection.kind === 'site' ? 'Override' : 'Custom'}
          onMutate={onMutate}
        />,
      );
    });
  }

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    document.body.replaceChildren();
  });

  function recorder(action: 'decreaseSpeed' | 'increaseSpeed' | 'resetSpeed'): HTMLButtonElement {
    const label =
      action === 'decreaseSpeed'
        ? 'Decrease speed'
        : action === 'increaseSpeed'
          ? 'Increase speed'
          : 'Reset speed';
    const button = container.querySelector(`[aria-label="Record shortcut: ${label}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`missing recorder for ${action}`);
    }
    return button;
  }

  it('renders the three actions and allows a global assignment that shadows a built-in binding', async () => {
    const onMutate = vi.fn();
    await renderCard(onMutate);
    expect(container.textContent).toContain('Hotkeys');
    expect(container.textContent).toContain('Decrease speed');
    expect(container.textContent).toContain('Increase speed');
    expect(container.textContent).toContain('Reset speed');

    await act(async () => {
      recorder('decreaseSpeed').click();
    });
    await flush();
    expect(recorder('decreaseSpeed').dataset.recording).toBe('true');
    await act(async () => {
      window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    });
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'hotkey-value',
      action: 'decreaseSpeed',
      value: { code: 'BracketRight', ctrl: false, alt: false, shift: false, meta: false },
    });
  });

  it('blocks a duplicate against another same-scope binding', async () => {
    const onMutate = vi.fn();
    const builtIn = resolveSiteBehavior().hotkeys;
    await renderCard(onMutate, {
      ...builtIn,
      increaseSpeed: { value: { ...BUILT_IN_HOTKEYS.increaseSpeed }, source: 'global' },
    });
    await act(async () => {
      recorder('decreaseSpeed').click();
    });
    await flush();
    await act(async () => {
      window.dispatchEvent(keydown('BracketRight', { key: ']' }));
    });
    expect(onMutate).not.toHaveBeenCalled();
    expect(container.textContent).toContain(hotkeyConflictMessage('increaseSpeed'));
  });

  it('records, cancels, and unbinds without assigning the activating Enter', async () => {
    const onMutate = vi.fn();
    await renderCard(onMutate);
    const decrease = recorder('decreaseSpeed');
    decrease.focus();
    await act(async () => {
      decrease.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Enter',
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
      decrease.dispatchEvent(
        new KeyboardEvent('keyup', {
          code: 'Enter',
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();
    expect(decrease.dataset.recording).toBe('true');
    expect(onMutate).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(keydown('KeyD', { key: 'd' }));
    });
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'hotkey-value',
      action: 'decreaseSpeed',
      value: { code: 'KeyD', ctrl: false, alt: false, shift: false, meta: false },
    });

    onMutate.mockClear();
    await act(async () => {
      recorder('increaseSpeed').click();
    });
    await flush();
    await act(async () => {
      window.dispatchEvent(keydown('Escape', { key: 'Escape' }));
    });
    expect(onMutate).not.toHaveBeenCalled();
    expect(recorder('increaseSpeed').dataset.recording).toBeUndefined();

    await act(async () => {
      recorder('resetSpeed').click();
    });
    await flush();
    await act(async () => {
      window.dispatchEvent(keydown('Backspace', { key: 'Backspace' }));
    });
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'hotkey-value',
      action: 'resetSpeed',
      value: null,
    });
  });

  it('rejects AltGraph, cancels on blur, and reports a window-blur takeover', async () => {
    const onMutate = vi.fn();
    await renderCard(onMutate);
    await act(async () => {
      recorder('decreaseSpeed').click();
    });
    await flush();
    await act(async () => {
      window.dispatchEvent(keydown('KeyA', { key: 'a', altGraph: true }));
    });
    expect(onMutate).not.toHaveBeenCalled();
    expect(recorder('decreaseSpeed').dataset.recording).toBe('true');

    await act(async () => {
      recorder('increaseSpeed').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
    });
    expect(recorder('decreaseSpeed').dataset.recording).toBeUndefined();
    expect(container.textContent).not.toContain('Chrome or your OS used that shortcut.');

    await act(async () => {
      recorder('increaseSpeed').click();
    });
    await flush();
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(recorder('increaseSpeed').dataset.recording).toBeUndefined();
    expect(container.querySelector('[data-slot="field-warning"]')?.textContent).toBe(
      'Chrome or your OS used that shortcut.',
    );
    expect(container.querySelector('[data-warning="true"]')).not.toBeNull();
    expect(container.querySelector('[data-invalid="true"]')).toBeNull();
  });

  it('keeps inherit distinct from an explicit unbind', async () => {
    const onMutate = vi.fn();
    const hotkeys = resolveSiteBehavior().hotkeys;
    await renderCard(
      onMutate,
      {
        ...hotkeys,
        resetSpeed: { value: null, source: 'site' },
        increaseSpeed: { value: { ...BUILT_IN_HOTKEYS.increaseSpeed }, source: 'built-in' },
      },
      { kind: 'site', hostname: 'www.youtube.com' },
    );

    expect(recorder('resetSpeed').textContent).toContain('None');
    expect(container.querySelector('[aria-label="Remove shortcut: Reset speed"]')).toHaveProperty(
      'disabled',
      true,
    );
    expect(
      container.querySelector('[aria-label="Remove shortcut: Increase speed"]'),
    ).toHaveProperty('disabled', false);
    const unboundReset = container.querySelector('[aria-label="Reset: Reset speed"]');
    expect(unboundReset).toBeInstanceOf(HTMLButtonElement);

    const inheritIncrease = container.querySelector('[aria-label="Reset: Increase speed"]');
    expect(
      inheritIncrease?.closest('[data-slot="reset-badge"]')?.getAttribute('data-active'),
    ).toBeNull();
  });

  it('removes a bound shortcut from the trash button and keeps the control when unbound', async () => {
    const onMutate = vi.fn();
    await renderCard(onMutate);
    const removeDecrease = container.querySelector(
      '[aria-label="Remove shortcut: Decrease speed"]',
    );
    expect(removeDecrease).toBeInstanceOf(HTMLButtonElement);
    expect(removeDecrease).toHaveProperty('disabled', false);
    await act(async () => {
      (removeDecrease as HTMLButtonElement).click();
    });
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'hotkey-value',
      action: 'decreaseSpeed',
      value: null,
    });
  });

  it('inherits even when the parent binding is already used by a site override', async () => {
    const onMutate = vi.fn();
    const builtIn = resolveSiteBehavior().hotkeys;
    await renderCard(
      onMutate,
      {
        decreaseSpeed: { value: { ...BUILT_IN_HOTKEYS.increaseSpeed }, source: 'site' },
        increaseSpeed: {
          value: { code: 'KeyA', ctrl: false, alt: false, shift: false, meta: false },
          source: 'site',
        },
        resetSpeed: builtIn.resetSpeed,
      },
      { kind: 'site', hostname: 'www.youtube.com' },
    );
    const inheritIncrease = container.querySelector('[aria-label="Reset: Increase speed"]');
    expect(inheritIncrease).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      (inheritIncrease as HTMLButtonElement).click();
    });
    expect(onMutate).toHaveBeenCalledWith({ kind: 'hotkey-inherit', action: 'increaseSpeed' });
  });

  it('warns when an inherited binding is shadowed by a more specific override', async () => {
    const onMutate = vi.fn();
    const builtIn = resolveSiteBehavior().hotkeys;
    await renderCard(
      onMutate,
      {
        decreaseSpeed: { value: { ...BUILT_IN_HOTKEYS.increaseSpeed }, source: 'site' },
        increaseSpeed: { value: { ...BUILT_IN_HOTKEYS.increaseSpeed }, source: 'global' },
        resetSpeed: builtIn.resetSpeed,
      },
      { kind: 'site', hostname: 'www.youtube.com' },
    );
    expect(onMutate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="field-warning"]')?.textContent).toBe(
      hotkeyShadowedMessage('decreaseSpeed'),
    );
    expect(container.querySelector('[data-warning="true"]')).not.toBeNull();
    expect(container.querySelector('[data-invalid="true"]')).toBeNull();
  });
});
