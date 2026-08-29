// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
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
import { SpeedControls } from '../../components/SpeedControls';
import './App.css';
import type { EnableSiteResponse, PopupStateResponse, SetSpeedResponse } from '../../core/messages';
import {
  adjustSpeed,
  DEFAULT_SPEED_POLICY,
  displaySpeed,
  resolveEffectiveSpeed,
} from '../../core/speed';

type PopupView = PopupStateResponse & {
  tabId: number;
  url: string;
};

const UNAVAILABLE = 'OS VSC isn’t available on this page';
const BROADER_GRANT =
  'This site is covered by broader Chrome site access. Change OS VSC’s Site access in Chrome’s extension settings.';

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
      <main className="popup">
        <h1>OS Video Speed Controller</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!view || !view.supported) {
    return (
      <main className="popup">
        <h1>OS Video Speed Controller</h1>
        <p className="unavailable">{UNAVAILABLE}</p>
        <SpeedControls
          displaySpeed={1}
          disabled
          onAdjust={() => undefined}
          onReset={() => undefined}
          onCommitSlider={() => undefined}
        />
        <label className="enable-row">
          <span>Enabled on this site</span>
          <input type="checkbox" disabled />
        </label>
      </main>
    );
  }

  const shown = sliderPreview ?? displaySpeed(view);

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
    ? (view.tabTarget ?? resolveEffectiveSpeed(view.siteSpeed))
    : resolveEffectiveSpeed(view.siteSpeed);

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
      setNotice(BROADER_GRANT);
      setView({ ...view, siteAccess: stillGranted });
      return;
    }
    await refresh();
  };

  return (
    <main className="popup">
      <h1>OS Video Speed Controller</h1>
      <SpeedControls
        displaySpeed={shown}
        disabled={!view.siteAccess}
        showOffBadge={!view.siteAccess}
        onAdjust={(direction) => {
          void sendSpeed(adjustSpeed(currentForAdjust, direction, DEFAULT_SPEED_POLICY));
        }}
        onReset={() => {
          void sendSpeed(1);
        }}
        onPreviewSlider={setSliderPreview}
        onCommitSlider={(speed) => {
          setSliderPreview(speed);
          void sendSpeed(speed);
        }}
      />
      <label className="enable-row">
        <span>Enabled on this site</span>
        <input
          type="checkbox"
          checked={view.siteAccess}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            const grant =
              enabled && !view.siteAccess ? requestExactOriginAccess(view.url) : undefined;
            void onToggle(enabled, grant);
          }}
        />
      </label>
      {notice ? <p className="notice">{notice}</p> : null}
    </main>
  );
}
