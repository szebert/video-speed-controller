// SPDX-License-Identifier: GPL-3.0-only

import {
  canAdjustSpeed,
  formatSpeed,
  isFixedSpeedPolicy,
  sliderBounds,
  sliderValue,
  snapSliderSpeed,
  SPEED_SLIDER_STEP,
  speedPolicyFrom,
  type SpeedPolicy,
} from '@/core/speed';
import { t } from '@/i18n/t';
import logoUrl from '@/assets/logo.svg';
import { openExtensionOptionsPage } from '@/settings/options-page';
import type { ThemePreference } from '@/settings/theme';
import { classes } from '@/ui/dom';
import { el } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { ThemeController } from '@/ui/theme-controller';
import {
  badge,
  button,
  createMenuButton,
  paintRange,
  rangeControl,
  switchControl,
  syncSwitch,
} from '@/ui/widgets';
import { PopupController, shownSpeed, type PopupState } from './popup-controller';

const THEME_ICONS = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
} as const;

function themeLabel(key: ThemePreference): string {
  if (key === 'dark') {
    return t('themeDark');
  }
  if (key === 'light') {
    return t('themeLight');
  }
  return t('themeSystem');
}

export class PopupView {
  private readonly abort = new AbortController();
  private unsubscribePopup: (() => void) | null = null;
  private unsubscribeTheme: (() => void) | null = null;
  private enableInput: HTMLInputElement | null = null;
  private speedRoot: HTMLElement | null = null;
  private mode: 'loading' | 'unavailable' | 'ready' = 'loading';

  constructor(
    private readonly root: HTMLElement,
    private readonly popup: PopupController,
    private readonly theme: ThemeController,
  ) {}

  start(): void {
    this.unsubscribePopup = this.popup.subscribe(() => this.render());
    this.unsubscribeTheme = this.theme.subscribe(() => this.renderThemeIcon());
    this.render();
  }

  destroy(): void {
    this.unsubscribePopup?.();
    this.unsubscribeTheme?.();
    this.abort.abort();
    this.root.replaceChildren();
  }

  private renderThemeIcon(): void {
    const trigger = this.root.querySelector('[aria-haspopup="menu"]');
    const current = THEME_ICONS[this.theme.getState().theme];
    const existing = trigger?.querySelector('svg');
    if (trigger && existing) {
      existing.replaceWith(icon(current));
    }
  }

  private render(): void {
    const state = this.popup.getState();
    const nextMode = !state.ready ? 'loading' : !state.view?.supported ? 'unavailable' : 'ready';
    if (nextMode !== this.mode || this.root.childElementCount === 0) {
      this.mode = nextMode;
      this.root.replaceChildren(this.shell(state));
      return;
    }
    this.sync(state);
  }

  private sync(state: PopupState): void {
    const notice = this.root.querySelector('[data-slot="alert"]');
    if (state.notice) {
      if (!notice) {
        this.mode = 'loading';
        this.render();
        return;
      }
      const title = notice.querySelector('[data-slot="alert-title"]');
      if (title) {
        title.textContent = state.notice;
      }
    } else if (notice) {
      notice.remove();
    }
    const view = state.view;
    if (!view?.supported || !this.enableInput || !this.speedRoot) {
      return;
    }
    syncSwitch(this.enableInput, view.siteAccess, false);
    const policy = speedPolicyFrom({
      min: view.speedMin,
      max: view.speedMax,
      decreaseStep: view.decreaseSpeedStep,
      increaseStep: view.increaseSpeedStep,
    });
    const shown = shownSpeed(state);
    const readout = this.speedRoot.querySelector('[data-slot="speed-readout"]');
    if (readout) {
      readout.textContent = formatSpeed(shown);
    }
    const range = this.speedRoot.querySelector('[data-slot="slider"]');
    if (range instanceof HTMLElement) {
      const input = range.querySelector('input[type="range"]');
      if (input instanceof HTMLInputElement) {
        input.disabled = !view.siteAccess;
        if (document.activeElement !== input) {
          input.value = String(sliderValue(shown, policy));
          paintRange(range);
        }
      }
    }
    this.syncAdjustButtons(shown, policy, !view.siteAccess);
  }

  private syncAdjustButtons(shown: number, policy: SpeedPolicy, locked: boolean): void {
    const slower = this.root.querySelector('[aria-label="' + t('slower') + '"]');
    const faster = this.root.querySelector('[aria-label="' + t('faster') + '"]');
    const fixed = isFixedSpeedPolicy(policy);
    if (slower instanceof HTMLButtonElement) {
      slower.disabled = locked || fixed || !canAdjustSpeed(shown, -1, policy);
    }
    if (faster instanceof HTMLButtonElement) {
      faster.disabled = locked || fixed || !canAdjustSpeed(shown, 1, policy);
    }
  }

  private shell(state: PopupState): HTMLElement {
    const hostname = state.view?.hostname;
    const main = el('main', { class: 'flex flex-col gap-4 p-4' });
    if (!state.ready) {
      main.append(el('p', { class: 'text-sm text-muted-foreground', text: t('popupLoading') }));
    } else if (!state.view?.supported) {
      main.append(
        el('p', { class: 'text-sm text-muted-foreground', text: t('popupUnavailable') }),
        this.enableRow(false, true),
        this.speedControls(1, true),
      );
    } else {
      const view = state.view;
      if (view.hostname) {
        main.append(
          el('p', { class: 'truncate text-sm text-muted-foreground', text: view.hostname }),
        );
      }
      const policy = speedPolicyFrom({
        min: view.speedMin,
        max: view.speedMax,
        decreaseStep: view.decreaseSpeedStep,
        increaseStep: view.increaseSpeedStep,
      });
      main.append(
        this.enableRow(view.siteAccess, false),
        this.speedControls(shownSpeed(state), !view.siteAccess, policy),
      );
    }
    if (state.notice) {
      main.append(this.notice(state.notice));
    }
    const theme = this.theme.getState().theme;
    return el(
      'div',
      { class: 'flex min-w-xs w-xs flex-col' },
      el(
        'header',
        { class: 'flex items-center justify-between gap-3 px-4 pt-4' },
        this.title(),
        el(
          'div',
          { class: 'flex items-center' },
          button(null, {
            variant: 'ghost',
            size: 'icon',
            icon: 'settings',
            attrs: { 'aria-label': t('openSettings') },
            onClick: () => {
              void openExtensionOptionsPage(hostname).catch((error) => {
                console.warn('OPEN_OPTIONS_PAGE failed', error);
              });
            },
          }),
          createMenuButton({
            label: t('changeTheme'),
            icon: THEME_ICONS[theme],
            items: () =>
              (['dark', 'light', 'system'] as const).map((key) => ({
                id: key,
                label: themeLabel(key),
                icon: THEME_ICONS[key],
                checked: this.theme.getState().theme === key,
              })),
            onSelect: (id) => {
              if (id === 'dark' || id === 'light' || id === 'system') {
                this.theme.setTheme(id);
              }
            },
          }),
        ),
      ),
      main,
    );
  }

  private title(): HTMLElement {
    const image = document.createElement('img');
    image.src = logoUrl;
    image.alt = '';
    image.width = 24;
    image.height = 24;
    image.className = 'size-6 shrink-0';
    image.setAttribute('aria-hidden', 'true');
    return el(
      'div',
      { class: 'flex min-w-0 items-center gap-2' },
      image,
      el('h1', {
        class: 'text-sm font-semibold [text-box:trim-both_cap_alphabetic]',
        text: t('popupTitle'),
      }),
    );
  }

  private enableRow(checked: boolean, disabled: boolean): HTMLElement {
    const label = el('span', {
      attrs: { id: 'enabled-on-this-site' },
      text: t('enabledOnThisSite'),
    });
    this.enableInput = switchControl({
      labelledBy: 'enabled-on-this-site',
      checked,
      disabled,
      onChange: (enabled) => {
        const grant = enabled ? this.popup.requestGrant() : undefined;
        this.popup.setEnabled(enabled, grant);
      },
    });
    return el(
      'div',
      { class: 'flex w-full items-center justify-between gap-3 text-sm' },
      label,
      this.enableInput.parentElement,
    );
  }

  private speedControls(
    displaySpeed: number,
    disabled: boolean,
    policy = speedPolicyFrom({ min: 0.25, max: 4, decreaseStep: 0.25, increaseStep: 0.25 }),
  ): HTMLElement {
    const shown = displaySpeed;
    const bounds = sliderBounds(policy);
    const fixed = isFixedSpeedPolicy(policy);
    const locked = disabled;
    const root = el('div', { class: 'flex flex-col gap-3' });
    this.speedRoot = root;
    const heading = el('h2', { class: 'text-sm font-medium', text: t('currentSiteSpeed') });
    const header = el(
      'div',
      { class: 'flex items-center justify-between gap-3' },
      heading,
      disabled ? badge(t('disabled'), 'secondary') : null,
    );
    const readout = el('div', {
      class: 'text-center text-3xl font-semibold tabular-nums',
      attrs: { 'aria-live': 'polite', 'data-slot': 'speed-readout' },
      text: formatSpeed(shown),
    });
    const slower = button(null, {
      variant: 'outline',
      icon: 'minus',
      class: 'flex-1',
      disabled: locked || fixed || !canAdjustSpeed(shown, -1, policy),
      attrs: { 'aria-label': t('slower') },
      onClick: () => this.popup.adjust(-1),
    });
    const reset = button(t('reset'), {
      variant: 'outline',
      class: 'flex-1',
      disabled: locked,
      onClick: () => this.popup.reset(),
    });
    const faster = button(null, {
      variant: 'outline',
      icon: 'plus',
      class: 'flex-1',
      disabled: locked || fixed || !canAdjustSpeed(shown, 1, policy),
      attrs: { 'aria-label': t('faster') },
      onClick: () => this.popup.adjust(1),
    });
    const group = el(
      'div',
      { class: 'flex w-full [&>[data-slot=button]]:flex-1' },
      slower,
      reset,
      faster,
    );
    const slider = fixed
      ? el('div', {
          class: 'relative flex w-full items-center opacity-50',
          attrs: { 'data-slot': 'slider', 'data-disabled': 'true', 'aria-hidden': 'true' },
        })
      : rangeControl({
          label: t('currentSiteSpeed'),
          min: bounds.minValue,
          max: bounds.maxValue,
          step: SPEED_SLIDER_STEP,
          value: sliderValue(shown, policy),
          disabled: locked,
          onInput: (value) => this.popup.previewSlider(snapSliderSpeed(value, policy)),
          onCommit: (value) => this.popup.commitSlider(snapSliderSpeed(value, policy)),
        });
    root.append(
      header,
      readout,
      group,
      el(
        'div',
        { class: 'flex items-center gap-2 text-xs text-muted-foreground' },
        el('span', { text: formatSpeed(policy.min) }),
        slider,
        el('span', { text: formatSpeed(policy.max) }),
      ),
    );
    return root;
  }

  private notice(message: string): HTMLElement {
    return el(
      'div',
      {
        class: classes(
          'grid w-full grid-cols-[auto_1fr] gap-x-2 rounded-lg border bg-card px-2.5 py-2 text-sm text-destructive',
        ),
        attrs: { role: 'alert', 'data-slot': 'alert' },
      },
      icon('circle-alert'),
      el('div', { attrs: { 'data-slot': 'alert-title' }, text: message }),
    );
  }
}
