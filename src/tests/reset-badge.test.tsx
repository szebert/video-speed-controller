// SPDX-License-Identifier: GPL-3.0-only

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResetBadge } from '@/components/ResetBadge';

describe('ResetBadge', () => {
  let root: Root | null = null;
  let container: HTMLElement;

  function renderBadge(props: {
    active?: boolean;
    disabled?: boolean;
    onReset?: () => void;
  }): void {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <ResetBadge
          active={props.active ?? true}
          disabled={props.disabled}
          text="Custom"
          label="Reset: Show overlay"
          onReset={props.onReset ?? (() => {})}
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

  it('does not capture pointer events while reserved as an invisible placeholder', () => {
    renderBadge({ active: false });
    const close = container.querySelector('[aria-label="Reset: Show overlay"]');
    const badge = close?.closest('[data-slot="reset-badge"]');
    expect(badge?.className).toContain('invisible');
    expect(badge?.className).toContain('pointer-events-none');
  });

  it('uses a ghost close button so hover matches other icon buttons', () => {
    renderBadge({});
    const close = container.querySelector('[aria-label="Reset: Show overlay"]');
    expect(close?.getAttribute('data-variant')).toBe('ghost');
    expect(close?.className).toContain('hover:bg-muted');
    expect(close?.hasAttribute('disabled')).toBe(false);
  });

  it('shows the disabled cursor on the close button when the badge is disabled', () => {
    const onReset = vi.fn();
    renderBadge({ disabled: true, onReset });
    const close = container.querySelector('[aria-label="Reset: Show overlay"]');
    const badge = close?.closest('[data-slot="reset-badge"]');
    expect(close?.hasAttribute('disabled')).toBe(true);
    expect(close?.parentElement?.className).toContain('cursor-not-allowed');
    expect(badge?.hasAttribute('data-disabled')).toBe(true);
    act(() => {
      if (close instanceof HTMLElement) {
        close.click();
      }
    });
    expect(onReset).not.toHaveBeenCalled();
  });
});
