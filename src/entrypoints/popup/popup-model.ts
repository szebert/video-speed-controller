// SPDX-License-Identifier: GPL-3.0-only

import {
  displaySpeed,
  resolveEffectiveSpeed,
  speedPolicyFrom,
  type SpeedPolicy,
} from '@/core/speed';
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

export function popupSpeedPolicy(view: PopupSession): SpeedPolicy {
  return speedPolicyFrom({
    min: view.speedMin,
    max: view.speedMax,
    decreaseStep: view.decreaseSpeedStep,
    increaseStep: view.increaseSpeedStep,
  });
}

export function shownSpeed(state: PopupState): number {
  const view = state.view;
  if (!view?.supported) {
    return 1;
  }
  return (
    state.sliderPreview ??
    displaySpeed({
      ...view,
      policy: popupSpeedPolicy(view),
    })
  );
}

export function adjustmentSpeed(view: PopupSession): number {
  const policy = popupSpeedPolicy(view);
  return view.siteAccess
    ? (view.tabTarget ?? resolveEffectiveSpeed(view.seedTarget, policy))
    : resolveEffectiveSpeed(view.seedTarget, policy);
}
