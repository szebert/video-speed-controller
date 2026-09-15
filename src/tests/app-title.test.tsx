// SPDX-License-Identifier: GPL-3.0-only

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppTitle } from '@/components/AppTitle';

describe('AppTitle', () => {
  let root: Root | null = null;
  let container: HTMLElement;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    document.body.replaceChildren();
  });

  it('places a decorative logo before the product title', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(<AppTitle />);
    });

    const heading = container.querySelector('h1');
    const logo = container.querySelector('img');
    expect(heading?.textContent).toBe('OS Video Speed Controller');
    expect(logo).toBeInstanceOf(HTMLImageElement);
    expect(logo?.getAttribute('alt')).toBe('');
    expect(logo?.getAttribute('aria-hidden')).toBe('true');
    expect(heading?.previousElementSibling).toBe(logo);
  });
});
