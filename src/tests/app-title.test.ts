// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { OptionsController } from '../entrypoints/options/options-controller';
import { OptionsView } from '../entrypoints/options/options-view';
import { resolveSiteBehavior } from '../settings/site-behavior';
import { ThemeController } from '../ui/theme-controller';

describe('AppTitle', () => {
  let view: OptionsView | null = null;
  let container: HTMLElement;

  afterEach(() => {
    view?.destroy();
    view = null;
    container?.remove();
    document.body.replaceChildren();
  });

  it('places a decorative logo before the product title', () => {
    container = document.createElement('div');
    document.body.append(container);
    const controller = new OptionsController();
    const { hotkeys, ...global } = resolveSiteBehavior();
    controller.snapshot = { global, globalHotkeys: hotkeys, site: null };
    controller.ready = true;
    view = new OptionsView(container, controller, new ThemeController('dark'));
    view.start();
    const heading = container.querySelector('h1');
    const logo = container.querySelector('img');
    expect(heading?.textContent).toBe('OS Video Speed Controller');
    expect(logo).toBeInstanceOf(HTMLImageElement);
    expect(logo?.getAttribute('alt')).toBe('');
    expect(logo?.getAttribute('aria-hidden')).toBe('true');
    expect(heading?.previousElementSibling).toBe(logo);
  });
});
