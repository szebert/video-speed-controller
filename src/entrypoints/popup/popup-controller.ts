// SPDX-License-Identifier: GPL-3.0-only

import {
  E2E_POPUP_TARGET_TAB_ID_KEY,
  E2E_POPUP_TARGET_URL_KEY,
  resolvePopupTargetTab,
} from '@/access/popup-target-tab';
import {
  containsExactOriginAccess,
  disableExactOriginAccess,
  requestExactOriginAccess,
} from '@/access/site-access';
import { adjustSpeed, displaySpeed, resolveEffectiveSpeed, speedPolicyFrom } from '@/core/speed';
import { t } from '@/i18n/t';
import { sendPopupRequest } from '@/protocol/rpc';
import type { PopupStateResponse } from '@/protocol/schemas/popup-background';

export type PopupSession = PopupStateResponse & {
  tabId: number;
  url: string;
};

export type PopupState = {
  ready: boolean;
  view: PopupSession | null;
  notice: string | null;
  sliderPreview: number | null;
};

type Listener = () => void;

async function loadPopup(): Promise<PopupSession | null> {
  const current = await chrome.tabs.getCurrent();
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const all = await chrome.tabs.query({});
  const e2e = await chrome.storage.session.get([
    E2E_POPUP_TARGET_URL_KEY,
    E2E_POPUP_TARGET_TAB_ID_KEY,
  ]);
  const tab = resolvePopupTargetTab(
    active,
    all,
    chrome.runtime.id,
    {
      tabId:
        typeof e2e[E2E_POPUP_TARGET_TAB_ID_KEY] === 'number'
          ? e2e[E2E_POPUP_TARGET_TAB_ID_KEY]
          : undefined,
      url:
        typeof e2e[E2E_POPUP_TARGET_URL_KEY] === 'string'
          ? e2e[E2E_POPUP_TARGET_URL_KEY]
          : undefined,
    },
    current?.id,
  );
  if (!tab?.id || !tab.url) {
    return null;
  }
  const state = await sendPopupRequest({
    type: 'GET_POPUP_STATE',
    tabId: tab.id,
    url: tab.url,
  });
  if (!state) {
    return null;
  }
  return { ...state, tabId: tab.id, url: tab.url };
}

export class PopupController {
  private ready = false;
  private view: PopupSession | null = null;
  private notice: string | null = null;
  private sliderPreview: number | null = null;
  private readonly listeners = new Set<Listener>();
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.load();
  }

  getState(): PopupState {
    return {
      ready: this.ready,
      view: this.view,
      notice: this.notice,
      sliderPreview: this.sliderPreview,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.started = false;
    this.listeners.clear();
  }

  previewSlider(speed: number): void {
    this.sliderPreview = speed;
    this.emit();
  }

  commitSlider(speed: number): void {
    this.sliderPreview = speed;
    this.emit();
    void this.sendSpeed(speed);
  }

  adjust(direction: 1 | -1): void {
    const view = this.view;
    if (!view?.supported) {
      return;
    }
    const policy = speedPolicyFrom({
      min: view.speedMin,
      max: view.speedMax,
      decreaseStep: view.decreaseSpeedStep,
      increaseStep: view.increaseSpeedStep,
    });
    const current = view.siteAccess
      ? (view.tabTarget ?? resolveEffectiveSpeed(view.seedTarget, policy))
      : resolveEffectiveSpeed(view.seedTarget, policy);
    void this.sendSpeed(adjustSpeed(current, direction, policy));
  }

  reset(): void {
    void this.sendReset();
  }

  setEnabled(enabled: boolean, grant?: Promise<boolean>): void {
    void this.onToggle(enabled, grant);
  }

  requestGrant(): Promise<boolean> | undefined {
    const view = this.view;
    if (!view?.supported || view.siteAccess) {
      return undefined;
    }
    return requestExactOriginAccess(view.url);
  }

  private async load(): Promise<void> {
    try {
      this.view = await loadPopup();
    } catch {
      this.view = null;
    } finally {
      this.ready = true;
      this.emit();
    }
  }

  private async refresh(): Promise<void> {
    this.sliderPreview = null;
    this.view = await loadPopup();
    this.emit();
  }

  private async ensureAccess(grant?: Promise<boolean>): Promise<boolean> {
    const view = this.view;
    if (!view) {
      return false;
    }
    if (view.siteAccess) {
      return true;
    }
    const granted = await (grant ?? requestExactOriginAccess(view.url));
    if (!granted) {
      return false;
    }
    this.view = { ...view, siteAccess: true };
    this.emit();
    return true;
  }

  private async sendSpeed(speed: number): Promise<void> {
    const view = this.view;
    if (!view || !(await this.ensureAccess())) {
      return;
    }
    const response = await sendPopupRequest({
      type: 'SET_SPEED',
      tabId: view.tabId,
      url: view.url,
      speed,
    });
    if (!response?.ok) {
      this.notice = response?.error ?? t('settingsSaveError');
      await this.refresh();
      return;
    }
    this.notice = response.persistError ?? null;
    await this.refresh();
  }

  private async sendReset(): Promise<void> {
    const view = this.view;
    if (!view || !(await this.ensureAccess())) {
      return;
    }
    const response = await sendPopupRequest({
      type: 'RESET_SITE_SPEED',
      tabId: view.tabId,
      url: view.url,
    });
    if (!response?.ok) {
      this.notice = response?.error ?? t('settingsSaveError');
      await this.refresh();
      return;
    }
    this.notice = response.persistError ?? null;
    await this.refresh();
  }

  private async onToggle(enabled: boolean, grant?: Promise<boolean>): Promise<void> {
    const view = this.view;
    if (!view?.supported) {
      return;
    }
    this.notice = null;
    this.emit();
    if (enabled) {
      if (!(await this.ensureAccess(grant))) {
        return;
      }
      const current = this.view;
      if (!current) {
        return;
      }
      const response = await sendPopupRequest({
        type: 'ENABLE_SITE',
        tabId: current.tabId,
        url: current.url,
      });
      if (!response?.ok) {
        this.notice = response?.error ?? t('settingsSaveError');
      }
      await this.refresh();
      return;
    }

    const result = await disableExactOriginAccess(view.url);
    if (!result.disabled) {
      const stillGranted = await containsExactOriginAccess(view.url);
      this.notice = t('broaderAccessNotice');
      this.view = { ...view, siteAccess: stillGranted };
      this.emit();
      return;
    }
    await this.refresh();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function shownSpeed(state: PopupState): number {
  const view = state.view;
  if (!view?.supported) {
    return 1;
  }
  const policy = speedPolicyFrom({
    min: view.speedMin,
    max: view.speedMax,
    decreaseStep: view.decreaseSpeedStep,
    increaseStep: view.increaseSpeedStep,
  });
  return state.sliderPreview ?? displaySpeed({ ...view, policy });
}
