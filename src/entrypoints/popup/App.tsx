// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState, type ReactNode } from 'react';
import { SettingsIcon } from 'lucide-react';
import { t } from '@/i18n/t';
import {
  E2E_POPUP_TARGET_TAB_ID_KEY,
  E2E_POPUP_TARGET_URL_KEY,
  resolvePopupTargetTab,
} from '../../access/popup-target-tab';
import {
  containsExactOriginAccess,
  disableExactOriginAccess,
  requestExactOriginAccess,
} from '../../access/site-access';
import { ModeToggle } from '@/components/mode-toggle';
import { SpeedControls } from '@/components/SpeedControls';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { EnableSiteResponse, PopupStateResponse, SetSpeedResponse } from '../../core/messages';
import {
  adjustSpeed,
  displaySpeed,
  resolveEffectiveSpeed,
  speedPolicyFrom,
} from '../../core/speed';
import { openExtensionOptionsPage } from '../../settings/options-page';

type PopupView = PopupStateResponse & {
  tabId: number;
  url: string;
};

async function loadPopup(): Promise<PopupView | null> {
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
  const state = (await chrome.runtime.sendMessage({
    type: 'GET_POPUP_STATE',
    tabId: tab.id,
    url: tab.url,
  })) as PopupStateResponse | undefined;
  if (!state) {
    return null;
  }
  return { ...state, tabId: tab.id, url: tab.url };
}

function PopupShell({
  children,
  notice,
  hostname,
}: {
  children: ReactNode;
  notice?: string | null;
  hostname?: string | null;
}) {
  return (
    <div className="flex min-w-xs w-xs flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <h1 className="text-sm font-semibold">{t('popupTitle')}</h1>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('openSettings')}
            onPress={() => {
              openExtensionOptionsPage(hostname);
            }}
          >
            <SettingsIcon data-icon="inline-start" />
          </Button>
          <ModeToggle />
        </div>
      </header>
      <main className="flex flex-col gap-4 p-4">{children}</main>
      {notice ? <p className="px-4 pb-4 text-sm text-destructive">{notice}</p> : null}
    </div>
  );
}

function EnableSwitch({
  isSelected,
  isDisabled,
  onChange,
}: {
  isSelected?: boolean;
  isDisabled?: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span id="enabled-on-this-site">{t('enabledOnThisSite')}</span>
      <Switch
        aria-labelledby="enabled-on-this-site"
        isSelected={isSelected}
        isDisabled={isDisabled}
        onChange={onChange}
      />
    </div>
  );
}

export function App() {
  const [view, setView] = useState<PopupView | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);

  useEffect(() => {
    void loadPopup()
      .then(setView)
      .catch(() => {
        setView(null);
      })
      .finally(() => {
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <PopupShell>
        <p className="text-sm text-muted-foreground">{t('popupLoading')}</p>
      </PopupShell>
    );
  }

  if (!view || !view.supported) {
    return (
      <PopupShell hostname={view?.hostname}>
        <p className="text-sm text-muted-foreground">{t('popupUnavailable')}</p>
        <SpeedControls
          displaySpeed={1}
          disabled
          onAdjust={() => undefined}
          onReset={() => undefined}
          onCommitSlider={() => undefined}
        />
        <EnableSwitch isDisabled />
      </PopupShell>
    );
  }

  const policy = speedPolicyFrom({
    min: view.speedMin,
    max: view.speedMax,
    tick: view.speedTick,
  });
  const shown = sliderPreview ?? displaySpeed({ ...view, policy });

  const refresh = async (): Promise<void> => {
    setSliderPreview(null);
    setView(await loadPopup());
  };

  const ensureAccess = async (grant?: Promise<boolean>): Promise<boolean> => {
    if (view.siteAccess) {
      return true;
    }
    const granted = await (grant ?? requestExactOriginAccess(view.url));
    if (!granted) {
      return false;
    }
    setView({ ...view, siteAccess: true });
    return true;
  };

  const currentForAdjust = view.siteAccess
    ? (view.tabTarget ?? resolveEffectiveSpeed(view.siteSpeed, policy))
    : resolveEffectiveSpeed(view.siteSpeed, policy);

  const sendSpeed = async (speed: number): Promise<void> => {
    if (!(await ensureAccess())) {
      return;
    }
    const response = (await chrome.runtime.sendMessage({
      type: 'SET_SPEED',
      tabId: view.tabId,
      url: view.url,
      speed,
    })) as SetSpeedResponse;
    if (!response.ok) {
      setNotice(response.error);
      await refresh();
      return;
    }
    setNotice(response.persistError ?? null);
    await refresh();
  };

  const sendReset = async (): Promise<void> => {
    if (!(await ensureAccess())) {
      return;
    }
    const response = (await chrome.runtime.sendMessage({
      type: 'RESET_SITE_SPEED',
      tabId: view.tabId,
      url: view.url,
    })) as SetSpeedResponse;
    if (!response.ok) {
      setNotice(response.error);
      await refresh();
      return;
    }
    setNotice(response.persistError ?? null);
    await refresh();
  };

  const onToggle = async (enabled: boolean, grant?: Promise<boolean>): Promise<void> => {
    setNotice(null);
    if (enabled) {
      if (!(await ensureAccess(grant))) {
        return;
      }
      const response = (await chrome.runtime.sendMessage({
        type: 'ENABLE_SITE',
        tabId: view.tabId,
        url: view.url,
      })) as EnableSiteResponse;
      if (!response.ok) {
        setNotice(response.error);
      }
      await refresh();
      return;
    }

    const result = await disableExactOriginAccess(view.url);
    if (!result.disabled) {
      const stillGranted = await containsExactOriginAccess(view.url);
      setNotice(t('broaderAccessNotice'));
      setView({ ...view, siteAccess: stillGranted });
      return;
    }
    await refresh();
  };

  return (
    <PopupShell notice={notice} hostname={view.hostname}>
      {view.hostname ? (
        <p className="truncate text-sm text-muted-foreground">{view.hostname}</p>
      ) : null}
      <EnableSwitch
        isSelected={view.siteAccess}
        onChange={(enabled) => {
          const grant =
            enabled && !view.siteAccess ? requestExactOriginAccess(view.url) : undefined;
          void onToggle(enabled, grant);
        }}
      />
      <SpeedControls
        displaySpeed={shown}
        disabled={!view.siteAccess}
        showOffBadge={!view.siteAccess}
        policy={policy}
        onAdjust={(direction) => {
          void sendSpeed(adjustSpeed(currentForAdjust, direction, policy));
        }}
        onReset={() => {
          void sendReset();
        }}
        onPreviewSlider={setSliderPreview}
        onCommitSlider={(speed) => {
          setSliderPreview(speed);
          void sendSpeed(speed);
        }}
      />
      <p className="text-xs text-muted-foreground">{t('changesApplyToThisSite')}</p>
    </PopupShell>
  );
}
