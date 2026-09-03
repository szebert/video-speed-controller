// SPDX-License-Identifier: GPL-3.0-only

import type { HostPattern } from '../access/site-access';
import {
  hasExactKeys,
  isEditableBehaviorField,
  isOverlayPosition,
  type BehaviorSettingChange,
  type EditableResolvedBehavior,
} from '../settings/site-behavior';
import { isAppliedTabBehavior, type AppliedTabBehavior } from './applied-tab-behavior';

export type GetPopupStateRequest = {
  type: 'GET_POPUP_STATE';
  tabId: number;
  url: string;
};

export type EnableSiteRequest = {
  type: 'ENABLE_SITE';
  tabId: number;
  url: string;
};

export type SetSpeedRequest = {
  type: 'SET_SPEED';
  tabId: number;
  url: string;
  speed: number;
};

export type ResetSiteSpeedRequest = {
  type: 'RESET_SITE_SPEED';
  tabId: number;
  url: string;
};

export type FrameReadyRequest = {
  type: 'FRAME_READY';
};

export type ReconcileAccessRequest = {
  type: 'RECONCILE_ACCESS';
  allowedHostPatterns: HostPattern[];
};

export type TopFrameDestroyedRequest = {
  type: 'TOP_FRAME_DESTROYED';
};

export type ApplyTabBehaviorRequest = {
  type: 'APPLY_TAB_BEHAVIOR';
  behavior: AppliedTabBehavior;
};

export type AdjustSpeedRequest = {
  type: 'ADJUST_SPEED';
  direction: -1 | 1;
};

export type BehaviorSettingsScope = { kind: 'global' } | { kind: 'site'; hostname: string };

export type GetBehaviorSettingsRequest = {
  type: 'GET_BEHAVIOR_SETTINGS';
  hostname?: string;
};

export type SetBehaviorSettingRequest = {
  type: 'SET_BEHAVIOR_SETTING';
  scope: BehaviorSettingsScope;
  change: BehaviorSettingChange;
  snapshotHostname?: string;
};

export type DeleteSiteSettingsRequest = {
  type: 'DELETE_SITE_SETTINGS';
  hostname: string;
  snapshotHostname?: string;
};

export type ResetGlobalBehaviorRequest = {
  type: 'RESET_GLOBAL_BEHAVIOR';
  snapshotHostname?: string;
};

export type ResetAllBehaviorRequest = {
  type: 'RESET_ALL_BEHAVIOR';
  snapshotHostname?: string;
};

export type ExtensionRequest =
  | GetPopupStateRequest
  | EnableSiteRequest
  | SetSpeedRequest
  | ResetSiteSpeedRequest
  | FrameReadyRequest
  | ReconcileAccessRequest
  | TopFrameDestroyedRequest
  | ApplyTabBehaviorRequest
  | AdjustSpeedRequest
  | GetBehaviorSettingsRequest
  | SetBehaviorSettingRequest
  | DeleteSiteSettingsRequest
  | ResetGlobalBehaviorRequest
  | ResetAllBehaviorRequest;

export type PopupStateResponse = {
  supported: boolean;
  hostname: string | null;
  siteSpeed: number | null;
  tabTarget: number | null;
  siteAccess: boolean;
  speedMin: number;
  speedMax: number;
  speedTick: number;
};

export type FrameReadyResponse = { action: 'applied' } | { action: 'dormant' };

export type SetSpeedResponse =
  { ok: true; targetSpeed: number; persistError?: string } | { ok: false; error: string };

export type EnableSiteResponse = { ok: true; targetSpeed: number } | { ok: false; error: string };

export type BehaviorSettingsSnapshot = {
  global: EditableResolvedBehavior;
  site: {
    hostname: string;
    behavior: EditableResolvedBehavior;
  } | null;
  customSites: string[];
};

export type GetBehaviorSettingsResponse =
  { ok: true; state: BehaviorSettingsSnapshot } | { ok: false; error: string };

export type ReapplyResult = {
  reappliedTabs: number;
  reapplyFailures: number;
  reapplyError?: string;
};

export type SetBehaviorSettingResponse =
  | ({ ok: true; state: BehaviorSettingsSnapshot; snapshotError?: never } & ReapplyResult)
  | ({ ok: true; state?: never; snapshotError: string } & ReapplyResult)
  | { ok: false; error: string };

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTabUrlRequest(value: object): value is { tabId: number; url: string } {
  return (
    isNonNegativeInteger((value as { tabId?: unknown }).tabId) &&
    typeof (value as { url?: unknown }).url === 'string'
  );
}

function isBehaviorSettingsScope(value: unknown): value is BehaviorSettingsScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as { kind?: unknown; hostname?: unknown };
  if (record.kind === 'global') {
    return hasExactKeys(record, ['kind']);
  }
  return (
    record.kind === 'site' &&
    hasExactKeys(record, ['kind', 'hostname']) &&
    typeof record.hostname === 'string'
  );
}

function isBehaviorSettingChange(value: unknown): value is BehaviorSettingChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as { kind?: unknown; field?: unknown; value?: unknown };
  if (!isEditableBehaviorField(record.field)) {
    return false;
  }
  if (record.kind === 'inherit') {
    return hasExactKeys(record, ['kind', 'field']);
  }
  if (record.kind !== 'value' || !hasExactKeys(record, ['kind', 'field', 'value'])) {
    return false;
  }
  if (
    record.field === 'speed' ||
    record.field === 'speedMin' ||
    record.field === 'speedMax' ||
    record.field === 'speedTick' ||
    record.field === 'overlayAutoHideDelayMs'
  ) {
    return typeof record.value === 'number';
  }
  if (record.field === 'overlayPosition') {
    return isOverlayPosition(record.value);
  }
  return (
    (record.field === 'overlayVisible' || record.field === 'overlayAutoHide') &&
    typeof record.value === 'boolean'
  );
}

function isGetBehaviorSettingsRequest(value: object): value is GetBehaviorSettingsRequest {
  if (hasExactKeys(value, ['type'])) {
    return true;
  }
  return (
    hasExactKeys(value, ['type', 'hostname']) &&
    typeof (value as { hostname?: unknown }).hostname === 'string'
  );
}

function isOptionalSnapshotHostname(value: object, requiredKeys: readonly string[]): boolean {
  const record = value as { snapshotHostname?: unknown };
  if (hasExactKeys(value, requiredKeys)) {
    return true;
  }
  return (
    hasExactKeys(value, [...requiredKeys, 'snapshotHostname']) &&
    typeof record.snapshotHostname === 'string'
  );
}

function isDeleteSiteSettingsRequest(value: object): value is DeleteSiteSettingsRequest {
  return (
    typeof (value as { hostname?: unknown }).hostname === 'string' &&
    isOptionalSnapshotHostname(value, ['type', 'hostname'])
  );
}

function isResetBehaviorRequest(value: object): boolean {
  return isOptionalSnapshotHostname(value, ['type']);
}

function isSetBehaviorSettingRequest(value: object): value is SetBehaviorSettingRequest {
  const record = value as {
    scope?: unknown;
    change?: unknown;
    snapshotHostname?: unknown;
  };
  if (!isBehaviorSettingsScope(record.scope) || !isBehaviorSettingChange(record.change)) {
    return false;
  }
  if (hasExactKeys(value, ['type', 'scope', 'change'])) {
    return true;
  }
  return (
    hasExactKeys(value, ['type', 'scope', 'change', 'snapshotHostname']) &&
    typeof record.snapshotHostname === 'string'
  );
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  switch (type) {
    case 'GET_POPUP_STATE':
    case 'ENABLE_SITE':
    case 'RESET_SITE_SPEED':
      return isTabUrlRequest(value);
    case 'SET_SPEED':
      return isTabUrlRequest(value) && Number.isFinite((value as { speed?: unknown }).speed);
    case 'FRAME_READY':
    case 'TOP_FRAME_DESTROYED':
      return true;
    case 'APPLY_TAB_BEHAVIOR':
      return isAppliedTabBehavior((value as { behavior?: unknown }).behavior);
    case 'ADJUST_SPEED':
      return (
        (value as { direction?: unknown }).direction === -1 ||
        (value as { direction?: unknown }).direction === 1
      );
    case 'RECONCILE_ACCESS':
      return (
        Array.isArray((value as { allowedHostPatterns?: unknown }).allowedHostPatterns) &&
        (value as ReconcileAccessRequest).allowedHostPatterns.every(
          (pattern) => typeof pattern === 'string',
        )
      );
    case 'GET_BEHAVIOR_SETTINGS':
      return isGetBehaviorSettingsRequest(value);
    case 'SET_BEHAVIOR_SETTING':
      return isSetBehaviorSettingRequest(value);
    case 'DELETE_SITE_SETTINGS':
      return isDeleteSiteSettingsRequest(value);
    case 'RESET_GLOBAL_BEHAVIOR':
    case 'RESET_ALL_BEHAVIOR':
      return isResetBehaviorRequest(value);
    default:
      return false;
  }
}
