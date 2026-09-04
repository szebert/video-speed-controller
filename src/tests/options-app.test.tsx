// SPDX-License-Identifier: GPL-3.0-only

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { SpeedControls } from '@/components/SpeedControls';
import type { BehaviorSettingsSnapshot, GetBehaviorSettingsResponse } from '../core/messages';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import { SPEED_MIN_SETTING_MIN } from '../core/speed';
import { App } from '../entrypoints/options/App';

function builtInBehavior() {
  return {
    speed: { value: 1, source: 'built-in' as const },
    speedMin: { value: 0.25, source: 'built-in' as const },
    speedMax: { value: 4, source: 'built-in' as const },
    speedTick: { value: 0.25, source: 'built-in' as const },
    overlayVisible: { value: true, source: 'built-in' as const },
    overlayPosition: { value: OVERLAY_POSITION.TOP_CENTER, source: 'built-in' as const },
    overlayPositionButton: { value: true, source: 'built-in' as const },
    overlaySettingsButton: { value: true, source: 'built-in' as const },
    overlayAutoHide: { value: true, source: 'built-in' as const },
    overlayHoverHold: { value: false, source: 'built-in' as const },
    overlayAutoHideDelayMs: { value: 2000, source: 'built-in' as const },
  };
}

function snapshot(site: string | null = null): BehaviorSettingsSnapshot {
  const global = builtInBehavior();
  return {
    global,
    site: site ? { hostname: site, behavior: { ...global } } : null,
  };
}

function loadReply(state: BehaviorSettingsSnapshot, customSites: string[] = []) {
  return async (message: { type?: string }) => {
    if (message.type === 'GET_CUSTOM_SITES') {
      return { ok: true, customSites };
    }
    if (message.type === 'GET_BEHAVIOR_SETTINGS') {
      return getOk(state);
    }
    return {
      ok: true,
      state,
      reappliedTabs: 0,
      reapplyFailures: 0,
    };
  };
}

function getOk(state: BehaviorSettingsSnapshot): GetBehaviorSettingsResponse {
  return { ok: true, state };
}

function click(element: Element | null): void {
  if (element instanceof HTMLElement) {
    element.click();
  }
}

function resetBadge(
  container: ParentNode,
  name: string,
): {
  button: Element | null;
  root: Element | null;
} {
  const button = container.querySelector(`[aria-label="${name}"]`);
  return { button, root: button?.closest('[data-slot="reset-badge"]') ?? null };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Options page', () => {
  let root: Root | null = null;
  let container: HTMLElement;
  const sendMessage = vi.fn();

  async function renderApp(href = 'chrome-extension://extid/options.html'): Promise<void> {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(href),
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ThemeProvider initialTheme="dark">
          <App />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    sendMessage.mockReset();
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        sync: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('loads global defaults on mount', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_BEHAVIOR_SETTINGS' });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_CUSTOM_SITES' });
    expect(container.textContent).toContain('Global defaults');
    expect(container.textContent).toContain('Sites use these values until you change them.');
    expect(container.textContent).toContain('No site settings yet.');
    expect(container.textContent).not.toContain('Built-in');
    expect(container.textContent).not.toContain('Use built-in');
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Global defaults');
    expect(container.textContent).not.toContain('Reset ALL Settings');
  });

  it('selects Site when ?site= is a valid hostname', async () => {
    sendMessage.mockImplementation(loadReply(snapshot('example.com')));
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'GET_BEHAVIOR_SETTINGS',
      hostname: 'example.com',
    });
    expect(container.textContent).toContain('example.com');
    expect(container.querySelector('h2')?.textContent).toBe('example.com');
    expect(container.textContent).toContain('Overrides global defaults for this site.');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Reset defaults',
      ),
    ).toBe(false);
  });

  it('treats an invalid ?site= as Global-only before GET', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp('chrome-extension://extid/options.html?site=example.com:8080');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_BEHAVIOR_SETTINGS' });
    expect(container.querySelector('h2')?.textContent).toBe('Global defaults');
  });

  it('lists custom sites and loads a site when selected', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; hostname?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['www.youtube.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS' && message.hostname === 'www.youtube.com') {
        return getOk(snapshot('www.youtube.com'));
      }
      return getOk(snapshot());
    });
    await renderApp();
    expect(container.textContent).toContain('www.youtube.com');
    const siteButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'www.youtube.com',
    );
    await act(async () => {
      siteButton?.click();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'GET_BEHAVIOR_SETTINGS',
      hostname: 'www.youtube.com',
    });
    expect(container.querySelector('h2')?.textContent).toBe('www.youtube.com');
  });

  it('resets only speed from the speed controls without a confirmation', async () => {
    const state = snapshot();
    state.global.speed = { value: 1.5, source: 'global' };
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(state);
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    expect(container.textContent).not.toContain('Use built-in');
    const resetSpeed = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset',
    );
    expect(resetSpeed).toBeTruthy();
    await act(async () => {
      resetSpeed?.click();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'inherit', field: 'speed' },
    });
  });

  it('disables speed Reset when the field is already inherited', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    const resetSpeed = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset' && button.getAttribute('aria-label') == null,
    );
    expect(resetSpeed).toBeTruthy();
    expect(resetSpeed?.hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('[aria-label="Reset: Minimum speed"]')).toBeNull();
    expect(container.querySelector('[aria-label="Reset: Speed step"]')).toBeNull();
    expect(container.querySelector('[aria-label="Reset: Maximum speed"]')).toBeNull();
    expect(container.querySelector('[aria-label="Reset: Auto-hide delay"]')).toBeNull();
    for (const id of ['speed-min', 'speed-tick', 'speed-max', 'overlay-auto-hide-delay']) {
      expect(container.querySelector(`#${id}`)?.classList.contains('text-muted-foreground')).toBe(
        true,
      );
    }
  });

  it('inherits a global number override from the input-group Reset', async () => {
    const state = snapshot();
    state.global.speedMin = { value: 0.5, source: 'global' };
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(state);
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const resetMin = container.querySelector('[aria-label="Reset: Minimum speed"]');
    expect(resetMin).toBeTruthy();
    expect(resetMin?.textContent).not.toContain('Reset');
    expect(container.querySelector('#speed-min')?.classList.contains('text-muted-foreground')).toBe(
      false,
    );
    await act(async () => {
      click(resetMin);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'inherit', field: 'speedMin' },
    });
  });

  it('inherits a global switch override from the Custom badge', async () => {
    const state = snapshot();
    state.global.overlayVisible = { value: false, source: 'global' };
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(state);
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const { button, root } = resetBadge(container, 'Reset: Show overlay');
    expect(button).toBeTruthy();
    expect(root?.textContent).toContain('Custom');
    expect(button?.hasAttribute('disabled')).toBe(false);
    expect(root?.className).not.toContain('invisible');
    expect(root?.getAttribute('data-slot')).toBe('reset-badge');
    expect(root?.hasAttribute('data-active')).toBe(true);
    await act(async () => {
      click(button);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'inherit', field: 'overlayVisible' },
    });
  });

  it('labels a site switch override as Override', async () => {
    const state = snapshot('example.com');
    if (state.site) {
      state.site.behavior.overlayVisible = { value: false, source: 'site' };
    }
    sendMessage.mockImplementation(loadReply(state));
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    const { root } = resetBadge(container, 'Reset: Show overlay');
    expect(root?.textContent).toContain('Override');
    expect(root?.hasAttribute('data-active')).toBe(true);
  });

  it('inherits a global position override from the Reset badge', async () => {
    const state = snapshot();
    state.global.overlayPosition = { value: OVERLAY_POSITION.BOTTOM_RIGHT, source: 'global' };
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(state);
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const { button, root } = resetBadge(container, 'Reset: Position');
    expect(button).toBeTruthy();
    expect(root?.textContent).toContain('Custom');
    expect(root?.hasAttribute('data-active')).toBe(true);
    await act(async () => {
      click(button);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'inherit', field: 'overlayPosition' },
    });
  });

  it('keeps a hidden Custom badge in layout when the field is inherited', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    const { button, root } = resetBadge(container, 'Reset: Show overlay');
    expect(button).toBeTruthy();
    expect(root?.textContent).toContain('Custom');
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(root?.className).toContain('invisible');
    expect(root?.className).toContain('pointer-events-none');
    expect(root?.hasAttribute('data-active')).toBe(false);
    await act(async () => {
      click(button);
    });
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_BEHAVIOR_SETTING',
        change: { kind: 'inherit', field: 'overlayVisible' },
      }),
    );
  });

  it('maps the nine named position labels to BOTTOM_RIGHT', async () => {
    const labels = [
      'Top left',
      'Top center',
      'Top right',
      'Center left',
      'Center',
      'Center right',
      'Bottom left',
      'Bottom center',
      'Bottom right',
    ];
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    expect(container.textContent).toContain('Where overlay controls appear on videos.');
    expect(container.textContent).toContain('Seconds of inactivity before the overlay hides.');
    for (const label of labels) {
      expect(container.textContent).toContain(label);
    }
    const radios = [...container.querySelectorAll('label, [role="radio"], input[type="radio"]')];
    const bottomRight = radios.find((radio) => radio.textContent?.trim() === 'Bottom right');
    expect(bottomRight).toBeTruthy();
    await act(async () => {
      click(bottomRight ?? null);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: {
        kind: 'value',
        field: 'overlayPosition',
        value: OVERLAY_POSITION.BOTTOM_RIGHT,
      },
    });
  });

  it('clamps delay below 0.1 seconds to 100 ms', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const input = container.querySelector('#overlay-auto-hide-delay');
    expect(input).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.focus();
      setInputValue(input, '0');
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      input.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayAutoHideDelayMs', value: 100 },
    });
  });

  it('clamps delay above 300 seconds to 5 minutes', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const input = container.querySelector('#overlay-auto-hide-delay');
    expect(input).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.focus();
      setInputValue(input, '999');
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      input.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayAutoHideDelayMs', value: 300_000 },
    });
  });

  it('persists delay 2.5 seconds as 2500 ms', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const input = container.querySelector('#overlay-auto-hide-delay');
    expect(input).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.focus();
      setInputValue(input, '2.5');
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      input.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayAutoHideDelayMs', value: 2500 },
    });
  });

  it('clamps minimum speed below 0.0625 and tick below 0.0005', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const minInput = container.querySelector('#speed-min');
    const tickInput = container.querySelector('#speed-tick');
    expect(minInput).toBeInstanceOf(HTMLInputElement);
    expect(tickInput).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      if (!(minInput instanceof HTMLInputElement)) {
        return;
      }
      minInput.focus();
      setInputValue(minInput, '0.01');
      minInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      minInput.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'speedMin', value: 0.0625 },
    });
    await act(async () => {
      if (!(tickInput instanceof HTMLInputElement)) {
        return;
      }
      tickInput.focus();
      setInputValue(tickInput, '0.0001');
      tickInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      tickInput.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'speedTick', value: 0.0005 },
    });
  });

  it('persists speed max 10 and tick 0.05', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const maxInput = container.querySelector('#speed-max');
    const tickInput = container.querySelector('#speed-tick');
    expect(maxInput).toBeInstanceOf(HTMLInputElement);
    expect(tickInput).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      if (!(maxInput instanceof HTMLInputElement)) {
        return;
      }
      maxInput.focus();
      setInputValue(maxInput, '10');
      maxInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      maxInput.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'speedMax', value: 10 },
    });
    await act(async () => {
      if (!(tickInput instanceof HTMLInputElement)) {
        return;
      }
      tickInput.focus();
      setInputValue(tickInput, '0.05');
      tickInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      tickInput.blur();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'speedTick', value: 0.05 },
    });
  });

  it('sends overlayVisible false from the Show overlay switch', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const visibleSwitch = container.querySelector('#overlay-visible');
    expect(visibleSwitch).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      click(visibleSwitch);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayVisible', value: false },
    });
  });

  it('places switch and position descriptions under their labels', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    for (const id of [
      'overlay-visible',
      'overlay-position-button',
      'overlay-settings-button',
      'overlay-auto-hide',
      'overlay-hover-hold',
    ]) {
      const label = container.querySelector(`label[for="${id}"]`);
      expect(label?.nextElementSibling?.getAttribute('data-slot')).toBe('field-description');
    }
    const positionLabel = [...container.querySelectorAll('[data-slot="field-label"]')].find(
      (element) => element.textContent === 'Position',
    );
    expect(positionLabel?.nextElementSibling?.getAttribute('data-slot')).toBe('field-description');
  });

  it('lets reset badges wrap under their switches', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    for (const id of [
      'overlay-visible',
      'overlay-position-button',
      'overlay-settings-button',
      'overlay-auto-hide',
      'overlay-hover-hold',
    ]) {
      const field = container.querySelector(`#${id}`)?.closest('[data-slot="field"]');
      const cluster = field?.querySelector('[data-slot="reset-badge"]')?.parentElement;
      expect(cluster?.className).toContain('flex-wrap-reverse');
    }
  });

  it('places input descriptions under their input groups', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    for (const id of ['speed-min', 'speed-tick', 'speed-max', 'overlay-auto-hide-delay']) {
      const input = container.querySelector(`#${id}`);
      const group = input?.closest('[data-slot="input-group"]');
      expect(group?.nextElementSibling?.getAttribute('data-slot')).toBe('field-description');
    }
  });

  it('groups position and settings overlay buttons on one wide-screen row', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    const positionButton = container
      .querySelector('#overlay-position-button')
      ?.closest('[data-slot="field"]');
    const settingsButton = container
      .querySelector('#overlay-settings-button')
      ?.closest('[data-slot="field"]');
    expect(positionButton?.parentElement).toBe(settingsButton?.parentElement);
    expect(positionButton?.parentElement?.getAttribute('data-slot')).toBe('field-group');
    expect(positionButton?.parentElement?.className).toContain('@md/field-group:grid-cols-2');
    expect(positionButton?.parentElement).not.toBe(
      container.querySelector('#overlay-auto-hide')?.closest('[data-slot="field"]')?.parentElement,
    );
  });

  it('groups auto-hide overlay, hover hold, and delay on one wide-screen row', async () => {
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    const autoHideField = container
      .querySelector('#overlay-auto-hide')
      ?.closest('[data-slot="field"]');
    const hoverField = container
      .querySelector('#overlay-hover-hold')
      ?.closest('[data-slot="field"]');
    const delayField = container
      .querySelector('#overlay-auto-hide-delay')
      ?.closest('[data-slot="field"]');
    expect(autoHideField?.parentElement).toBe(hoverField?.parentElement);
    expect(hoverField?.parentElement).toBe(delayField?.parentElement);
    expect(autoHideField?.parentElement?.getAttribute('data-slot')).toBe('field-group');
    expect(autoHideField?.parentElement?.className).toContain('@xl/field-group:grid-cols-3');
  });

  it('sends overlayPositionButton false from the Show position button switch', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const toggle = container.querySelector('#overlay-position-button');
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      click(toggle);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayPositionButton', value: false },
    });
  });

  it('sends overlayHoverHold true from the Prevent auto-hide on hover switch', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const toggle = container.querySelector('#overlay-hover-hold');
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      click(toggle);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayHoverHold', value: true },
    });
  });

  it('sends overlaySettingsButton false from the Show settings button switch', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const toggle = container.querySelector('#overlay-settings-button');
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      click(toggle);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlaySettingsButton', value: false },
    });
  });

  it('toggles Show overlay when the field label is clicked', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const label = container.querySelector('label[for="overlay-visible"]');
    expect(label).toBeInstanceOf(HTMLLabelElement);
    expect(label?.textContent).toBe('Show overlay');
    await act(async () => {
      click(label);
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
      change: { kind: 'value', field: 'overlayVisible', value: false },
    });
  });

  it('disables overlay position auto-hide and delay when Show overlay is off', async () => {
    const hidden = snapshot();
    hidden.global.overlayVisible = { value: false, source: 'global' };
    sendMessage.mockImplementation(loadReply(hidden));
    await renderApp();
    const delay = container.querySelector('#overlay-auto-hide-delay');
    expect(delay).toBeInstanceOf(HTMLInputElement);
    expect((delay as HTMLInputElement).disabled).toBe(true);
    const autoHide = container.querySelector('#overlay-auto-hide');
    expect(autoHide).toBeInstanceOf(HTMLInputElement);
    expect((autoHide as HTMLInputElement).disabled).toBe(true);
    const hoverHold = container.querySelector('#overlay-hover-hold');
    expect(hoverHold).toBeInstanceOf(HTMLInputElement);
    expect((hoverHold as HTMLInputElement).disabled).toBe(true);
    const positionButton = container.querySelector('#overlay-position-button');
    const settingsButton = container.querySelector('#overlay-settings-button');
    expect((positionButton as HTMLInputElement).disabled).toBe(true);
    expect((settingsButton as HTMLInputElement).disabled).toBe(true);
  });

  it('disables auto-hide delay when Auto-hide overlay is off', async () => {
    const hidden = snapshot();
    hidden.global.overlayAutoHide = { value: false, source: 'global' };
    hidden.global.overlayAutoHideDelayMs = { value: 2500, source: 'global' };
    sendMessage.mockImplementation(loadReply(hidden));
    await renderApp();
    const delay = container.querySelector('#overlay-auto-hide-delay');
    expect(delay).toBeInstanceOf(HTMLInputElement);
    expect((delay as HTMLInputElement).disabled).toBe(true);
    const autoHide = container.querySelector('#overlay-auto-hide');
    expect(autoHide).toBeInstanceOf(HTMLInputElement);
    expect((autoHide as HTMLInputElement).disabled).toBe(false);
    const hoverHold = container.querySelector('#overlay-hover-hold');
    expect(hoverHold).toBeInstanceOf(HTMLInputElement);
    expect((hoverHold as HTMLInputElement).disabled).toBe(true);
    const resetDelay = container.querySelector('[aria-label="Reset: Auto-hide delay"]');
    expect(resetDelay).toBeTruthy();
    expect(resetDelay?.hasAttribute('disabled')).toBe(true);
    expect(resetDelay?.className).toContain('data-disabled:opacity-50');
  });

  it('resets defaults without watching whether values are already default', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const resetDefaults = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset defaults',
    );
    expect(resetDefaults).toBeTruthy();
    expect(resetDefaults?.hasAttribute('disabled')).toBe(false);
    await act(async () => {
      resetDefaults?.click();
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'RESET_GLOBAL_BEHAVIOR' });
  });

  it('confirms Reset ALL Settings before sending RESET_ALL_BEHAVIOR', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    const settings = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Settings',
    );
    await act(async () => {
      settings?.click();
    });
    expect(container.querySelector('h2')?.textContent).toBe('Settings');
    expect(container.textContent).toContain('Restore settings to defaults');
    const resetAll = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset ALL Settings',
    );
    await act(async () => {
      resetAll?.click();
    });
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESET_ALL_BEHAVIOR' }),
    );
    const confirm = [...document.querySelectorAll('[data-slot="alert-dialog-action"]')].find(
      (button) => button.textContent === 'Reset',
    );
    expect(confirm).toBeTruthy();
    await act(async () => {
      click(confirm ?? null);
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'RESET_ALL_BEHAVIOR' });
  });

  it('deletes a listed site after confirmation', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; hostname?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['example.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    const trash = container.querySelector('[aria-label="Delete site settings: example.com"]');
    await act(async () => {
      click(trash);
    });
    const confirm = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      confirm?.click();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DELETE_SITE_SETTINGS',
      hostname: 'example.com',
      snapshotHostname: 'example.com',
    });
  });

  it('recovers with one GET after a failed persist', async () => {
    const recovered = snapshot();
    recovered.global.speed = { value: 1.25, source: 'global' };
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(recovered);
      }
      return { ok: false, error: 'quota' };
    });
    await renderApp();
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(recovered);
      }
      return { ok: false, error: 'quota' };
    });
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    const types = sendMessage.mock.calls.map((call) => call[0]?.type);
    expect(types).toEqual(['SET_BEHAVIOR_SETTING', 'GET_BEHAVIOR_SETTINGS']);
    expect(container.textContent).toContain('quota');
    expect(container.textContent).toContain('1.25×');
  });

  it('shows the refresh warning when open tabs could not be refreshed', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 1,
        reapplyError: 'tabs.query failed',
      };
    });
    await renderApp();
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(container.textContent).toContain('Saved, but open tabs could not be refreshed.');
  });

  it('adds a site from membership without rescanning after a successful site SET', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; hostname?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      return {
        ok: true,
        state: snapshot('example.com'),
        siteMembership: { hostname: 'example.com', customized: true },
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    expect(container.textContent).toContain('No site settings yet.');
    sendMessage.mockClear();
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual(['SET_BEHAVIOR_SETTING']);
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).not.toContain('No site settings yet.');
  });

  it('recovers pane and sidebar after a failed site persist', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['example.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      return { ok: false, error: 'quota' };
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    sendMessage.mockClear();
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'SET_BEHAVIOR_SETTING',
      'GET_BEHAVIOR_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);
  });

  it('recovers pane after ok-without-state', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      return {
        ok: true,
        snapshotError: 'refresh failed',
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp();
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        const recovered = snapshot();
        recovered.global.speed = { value: 1.25, source: 'global' };
        return getOk(recovered);
      }
      return {
        ok: true,
        snapshotError: 'refresh failed',
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'SET_BEHAVIOR_SETTING',
      'GET_BEHAVIOR_SETTINGS',
    ]);
    expect(container.textContent).toContain('1.25×');
    expect(container.textContent).toContain('Saved, but settings could not be refreshed.');
  });

  it('rescans custom sites when a successful delete omits membership', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; hostname?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['example.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    const trash = container.querySelector('[aria-label="Delete site settings: example.com"]');
    await act(async () => {
      click(trash);
    });
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      return {
        ok: true,
        state: snapshot(),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    const confirm = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      confirm?.click();
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'DELETE_SITE_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);
    expect(container.textContent).toContain('No site settings yet.');
    expect(container.textContent).not.toContain('Could not save this setting.');
  });

  it('rescans custom sites when a successful site save omits membership', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; hostname?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['example.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      return {
        ok: true,
        state: snapshot('example.com'),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).not.toContain('No site settings yet.');
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      return {
        ok: true,
        state: snapshot('example.com'),
        reappliedTabs: 0,
        reapplyFailures: 0,
      };
    });
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'SET_BEHAVIOR_SETTING',
      'GET_CUSTOM_SITES',
    ]);
    expect(container.textContent).toContain('No site settings yet.');
    expect(container.textContent).not.toContain('Could not save this setting.');
  });

  it('recovers pane after a thrown persist', async () => {
    const recovered = snapshot();
    recovered.global.speed = { value: 1.25, source: 'global' };
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(recovered);
      }
      throw new Error('channel closed');
    });
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'SET_BEHAVIOR_SETTING',
      'GET_BEHAVIOR_SETTINGS',
    ]);
    expect(container.textContent).toContain('Could not save this setting.');
    expect(container.textContent).toContain('1.25×');
  });

  it('recovers pane and sidebar after a thrown site persist', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['example.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      throw new Error('channel closed');
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    sendMessage.mockClear();
    const faster = container.querySelector('[aria-label="Faster"]');
    await act(async () => {
      click(faster);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'SET_BEHAVIOR_SETTING',
      'GET_BEHAVIOR_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);
    expect(container.textContent).toContain('Could not save this setting.');
  });

  it('recovers pane after a thrown Reset defaults', async () => {
    const recovered = snapshot();
    recovered.global.speed = { value: 1.25, source: 'global' };
    sendMessage.mockImplementation(loadReply(snapshot()));
    await renderApp();
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(recovered);
      }
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      throw new Error('channel closed');
    });
    const resetDefaults = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset defaults',
    );
    await act(async () => {
      resetDefaults?.click();
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'RESET_GLOBAL_BEHAVIOR',
      'GET_BEHAVIOR_SETTINGS',
    ]);
    expect(container.textContent).toContain('Could not save this setting.');
    expect(container.textContent).toContain('1.25×');
  });

  it('recovers pane and sidebar after a thrown Reset All', async () => {
    sendMessage.mockImplementation(loadReply(snapshot(), ['example.com']));
    await renderApp();
    const settings = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Settings',
    );
    await act(async () => {
      settings?.click();
    });
    const resetAll = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset ALL Settings',
    );
    await act(async () => {
      resetAll?.click();
    });
    sendMessage.mockClear();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: [] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot());
      }
      throw new Error('channel closed');
    });
    const confirm = [...document.querySelectorAll('[data-slot="alert-dialog-action"]')].find(
      (button) => button.textContent === 'Reset',
    );
    await act(async () => {
      click(confirm ?? null);
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'RESET_ALL_BEHAVIOR',
      'GET_BEHAVIOR_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);
    expect(container.textContent).toContain('Could not save this setting.');
    expect(container.textContent).toContain('No site settings yet.');
  });

  it('recovers pane and sidebar after a thrown site delete', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; hostname?: string }) => {
      if (message.type === 'GET_CUSTOM_SITES') {
        return { ok: true, customSites: ['example.com'] };
      }
      if (message.type === 'GET_BEHAVIOR_SETTINGS') {
        return getOk(snapshot('example.com'));
      }
      throw new Error('channel closed');
    });
    await renderApp('chrome-extension://extid/options.html?site=example.com');
    const trash = container.querySelector('[aria-label="Delete site settings: example.com"]');
    await act(async () => {
      click(trash);
    });
    sendMessage.mockClear();
    const confirm = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      confirm?.click();
    });
    expect(sendMessage.mock.calls.map((call) => call[0]?.type)).toEqual([
      'DELETE_SITE_SETTINGS',
      'GET_BEHAVIOR_SETTINGS',
      'GET_CUSTOM_SITES',
    ]);
    expect(container.textContent).toContain('Could not save this setting.');
  });
});

describe('SpeedControls preview vs persist', () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 10,
      right: 100,
      width: 100,
      height: 10,
      toJSON() {
        return this;
      },
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('previews slider movement without committing until change end', async () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <SpeedControls
          displaySpeed={1}
          disabled={false}
          onAdjust={() => {}}
          onReset={() => {}}
          onPreviewSlider={onPreview}
          onCommitSlider={onCommit}
        />,
      );
    });
    const slider =
      container.querySelector('[role="slider"]') ??
      container.querySelector('[data-slot="slider-thumb"]');
    expect(slider).toBeTruthy();
    await act(async () => {
      slider?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    });
    expect(onPreview).toHaveBeenCalledWith(1.01);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1.01);
  });

  it('reaches policy max when min is the playbackRate floor', async () => {
    const onCommit = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <SpeedControls
          displaySpeed={3.99}
          disabled={false}
          policy={{ min: SPEED_MIN_SETTING_MIN, max: 4, tick: 0.25 }}
          onAdjust={() => {}}
          onReset={() => {}}
          onCommitSlider={onCommit}
        />,
      );
    });
    const slider =
      container.querySelector('[role="slider"]') ??
      container.querySelector('[data-slot="slider-thumb"]');
    expect(slider).toBeTruthy();
    await act(async () => {
      slider?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    });
    expect(onCommit).toHaveBeenCalledWith(4);
  });

  it('disables minus and plus at the policy bounds', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <SpeedControls
          displaySpeed={0.25}
          disabled={false}
          policy={{ min: 0.25, max: 4, tick: 0.25 }}
          onAdjust={() => {}}
          onReset={() => {}}
          onCommitSlider={() => {}}
        />,
      );
    });
    const slower = container.querySelector('[aria-label="Slower"]');
    const faster = container.querySelector('[aria-label="Faster"]');
    expect(slower).toBeInstanceOf(HTMLButtonElement);
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    expect((slower as HTMLButtonElement).disabled).toBe(true);
    expect((faster as HTMLButtonElement).disabled).toBe(false);
  });
});
