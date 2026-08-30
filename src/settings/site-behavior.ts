// SPDX-License-Identifier: GPL-3.0-only

import { DEFAULT_SPEED_POLICY, resolveEffectiveSpeed, type SpeedPolicy } from '../core/speed';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SITE_INHERIT_SYNC_RETENTION_MS = 30 * DAY_MS;
export const LOCAL_LRU_THROTTLE_MS = 60 * 1000;
export const SYNC_LRU_STALE_MS = 24 * 60 * 60 * 1000;
export const REPAIR_BACKOFF_MS = 5 * 60 * 1000;
export const SYNC_TARGET_MAX_SITE_ITEMS = 400;
export const SYNC_TARGET_MAX_BYTES = 80 * 1024;

export const GLOBAL_BEHAVIOR_KEY = 'defaults:site-behavior';
export const THEME_KEY = 'pref:theme';

export const OVERLAY_POSITION = {
  TOP_LEFT: 0,
  TOP_CENTER: 1,
  TOP_RIGHT: 2,
  CENTER_LEFT: 3,
  CENTER: 4,
  CENTER_RIGHT: 5,
  BOTTOM_LEFT: 6,
  BOTTOM_CENTER: 7,
  BOTTOM_RIGHT: 8,
} as const;

export type OverlayPosition = (typeof OVERLAY_POSITION)[keyof typeof OVERLAY_POSITION];

export type GridIndex = 0 | 1 | 2;

export function overlayPositionToGrid(position: OverlayPosition): {
  row: GridIndex;
  column: GridIndex;
} {
  return {
    row: Math.floor(position / 3) as GridIndex,
    column: (position % 3) as GridIndex,
  };
}

export function overlayPositionFromGrid(row: GridIndex, column: GridIndex): OverlayPosition {
  return (row * 3 + column) as OverlayPosition;
}

export type SiteHotkeyAction = 'increaseSpeed' | 'decreaseSpeed' | 'resetSpeed';

export const SITE_HOTKEY_ACTIONS = [
  'increaseSpeed',
  'decreaseSpeed',
  'resetSpeed',
] as const satisfies readonly SiteHotkeyAction[];

/** Future versioned serializable type. Not accepted in persisted V1 records this milestone. */
export type HotkeyBinding = unknown;

export type SettingSource = 'built-in' | 'global' | 'site';

export type ResolvedSetting<T> = {
  value: T;
  source: SettingSource;
};

export type SiteBehavior = {
  speed: number;
  overlayPosition: OverlayPosition;
  overlayAutoHide: boolean;
  overlayAutoHideDelayMs: number;
  hotkeys: Partial<Record<SiteHotkeyAction, HotkeyBinding | null>>;
};

export type Override<T> =
  { kind: 'value'; value: T; updatedAt: number } | { kind: 'inherit'; updatedAt: number };

export type BehaviorOverrides = {
  speed?: Override<number>;
  overlayPosition?: Override<OverlayPosition>;
  overlayAutoHide?: Override<boolean>;
  overlayAutoHideDelayMs?: Override<number>;
  hotkeys?: Partial<Record<SiteHotkeyAction, Override<HotkeyBinding | null>>>;
};

export type SiteSettingsV1 = {
  schemaVersion: 1;
  overrides: BehaviorOverrides;
  lastUsedAt: number;
};

export type GlobalBehaviorSettingsV1 = {
  schemaVersion: 1;
  overrides: BehaviorOverrides;
};

export type ResolvedSiteBehavior = {
  speed: ResolvedSetting<number>;
  overlayPosition: ResolvedSetting<OverlayPosition>;
  overlayAutoHide: ResolvedSetting<boolean>;
  overlayAutoHideDelayMs: ResolvedSetting<number>;
  hotkeys: Partial<Record<SiteHotkeyAction, ResolvedSetting<HotkeyBinding | null>>>;
};

export const BUILT_IN_SITE_BEHAVIOR: SiteBehavior = {
  speed: 1,
  overlayPosition: OVERLAY_POSITION.TOP_CENTER,
  overlayAutoHide: false,
  overlayAutoHideDelayMs: 2000,
  hotkeys: {},
};

export function isOverlayPosition(value: unknown): value is OverlayPosition {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 8;
}

export function isSiteHotkeyAction(value: unknown): value is SiteHotkeyAction {
  return typeof value === 'string' && (SITE_HOTKEY_ACTIONS as readonly string[]).includes(value);
}

export function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isOverride<T>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is T,
): value is Override<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { kind?: unknown; value?: unknown; updatedAt?: unknown };
  if (!isFiniteTimestamp(record.updatedAt)) {
    return false;
  }
  if (record.kind === 'inherit') {
    return true;
  }
  return record.kind === 'value' && isValue(record.value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function hasHotkeyEntries(overrides: BehaviorOverrides): boolean {
  const hotkeys = overrides.hotkeys;
  if (!hotkeys) {
    return false;
  }
  return Object.keys(hotkeys).length > 0;
}

export function parseBehaviorOverrides(value: unknown): BehaviorOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const overrides: BehaviorOverrides = {};

  if ('speed' in raw) {
    if (!isOverride(raw.speed, isFiniteNumber)) {
      return null;
    }
    overrides.speed = raw.speed;
  }
  if ('overlayPosition' in raw) {
    if (!isOverride(raw.overlayPosition, isOverlayPosition)) {
      return null;
    }
    overrides.overlayPosition = raw.overlayPosition;
  }
  if ('overlayAutoHide' in raw) {
    if (!isOverride(raw.overlayAutoHide, isBoolean)) {
      return null;
    }
    overrides.overlayAutoHide = raw.overlayAutoHide;
  }
  if ('overlayAutoHideDelayMs' in raw) {
    if (!isOverride(raw.overlayAutoHideDelayMs, isFiniteNumber)) {
      return null;
    }
    overrides.overlayAutoHideDelayMs = raw.overlayAutoHideDelayMs;
  }
  if ('hotkeys' in raw) {
    if (!raw.hotkeys || typeof raw.hotkeys !== 'object' || Array.isArray(raw.hotkeys)) {
      return null;
    }
    const keys = Object.keys(raw.hotkeys);
    if (keys.length > 0) {
      return null;
    }
    overrides.hotkeys = {};
  }

  return overrides;
}

export function parseSiteSettings(value: unknown): SiteSettingsV1 | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    schemaVersion?: unknown;
    overrides?: unknown;
    speed?: unknown;
    lastUsedAt?: unknown;
  };
  if (record.schemaVersion !== 1) {
    return null;
  }
  if ('speed' in record && !('overrides' in record)) {
    return null;
  }
  const overrides = parseBehaviorOverrides(record.overrides);
  if (!overrides || !isFiniteTimestamp(record.lastUsedAt)) {
    return null;
  }
  if (hasHotkeyEntries(overrides)) {
    return null;
  }
  return { schemaVersion: 1, overrides, lastUsedAt: record.lastUsedAt };
}

export function parseGlobalBehaviorSettings(value: unknown): GlobalBehaviorSettingsV1 | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as { schemaVersion?: unknown; overrides?: unknown; speed?: unknown };
  if (record.schemaVersion !== 1) {
    return null;
  }
  if ('speed' in record && !('overrides' in record)) {
    return null;
  }
  const overrides = parseBehaviorOverrides(record.overrides);
  if (!overrides) {
    return null;
  }
  if (hasHotkeyEntries(overrides)) {
    return null;
  }
  return { schemaVersion: 1, overrides };
}

export function listOverrides(overrides: BehaviorOverrides): Override<unknown>[] {
  const listed: Override<unknown>[] = [];
  if (overrides.speed) {
    listed.push(overrides.speed);
  }
  if (overrides.overlayPosition) {
    listed.push(overrides.overlayPosition);
  }
  if (overrides.overlayAutoHide) {
    listed.push(overrides.overlayAutoHide);
  }
  if (overrides.overlayAutoHideDelayMs) {
    listed.push(overrides.overlayAutoHideDelayMs);
  }
  if (overrides.hotkeys) {
    for (const action of SITE_HOTKEY_ACTIONS) {
      const field = overrides.hotkeys[action];
      if (field) {
        listed.push(field);
      }
    }
  }
  return listed;
}

export function hasSemanticOverrides(overrides: BehaviorOverrides): boolean {
  return listOverrides(overrides).length > 0;
}

export function isExpiredSiteInherit(override: Override<unknown>, now: number): boolean {
  return override.kind === 'inherit' && now - override.updatedAt > SITE_INHERIT_SYNC_RETENTION_MS;
}

export function hasSyncRetainedInherit(overrides: BehaviorOverrides, now: number): boolean {
  return listOverrides(overrides).some(
    (override) => override.kind === 'inherit' && !isExpiredSiteInherit(override, now),
  );
}

export function toSyncEligibleSiteRecord(
  record: SiteSettingsV1,
  now: number,
): SiteSettingsV1 | null {
  const overrides: BehaviorOverrides = {};
  if (record.overrides.speed && !isExpiredSiteInherit(record.overrides.speed, now)) {
    overrides.speed = record.overrides.speed;
  }
  if (
    record.overrides.overlayPosition &&
    !isExpiredSiteInherit(record.overrides.overlayPosition, now)
  ) {
    overrides.overlayPosition = record.overrides.overlayPosition;
  }
  if (
    record.overrides.overlayAutoHide &&
    !isExpiredSiteInherit(record.overrides.overlayAutoHide, now)
  ) {
    overrides.overlayAutoHide = record.overrides.overlayAutoHide;
  }
  if (
    record.overrides.overlayAutoHideDelayMs &&
    !isExpiredSiteInherit(record.overrides.overlayAutoHideDelayMs, now)
  ) {
    overrides.overlayAutoHideDelayMs = record.overrides.overlayAutoHideDelayMs;
  }
  if (!hasSemanticOverrides(overrides)) {
    return null;
  }
  return { schemaVersion: 1, overrides, lastUsedAt: record.lastUsedAt };
}

export function overridesEqual<T>(left: Override<T>, right: Override<T>): boolean {
  if (left.kind !== right.kind || left.updatedAt !== right.updatedAt) {
    return false;
  }
  if (left.kind === 'inherit' || right.kind === 'inherit') {
    return true;
  }
  return Object.is(left.value, right.value);
}

export function mergeOverrideField<T>(
  syncField: Override<T> | undefined,
  localField: Override<T> | undefined,
): Override<T> | undefined {
  if (!syncField && !localField) {
    return undefined;
  }
  if (!syncField) {
    return localField;
  }
  if (!localField) {
    return syncField;
  }
  if (syncField.updatedAt !== localField.updatedAt) {
    return localField.updatedAt > syncField.updatedAt ? localField : syncField;
  }
  if (overridesEqual(syncField, localField)) {
    return syncField;
  }
  if (syncField.kind === 'inherit') {
    return syncField;
  }
  if (localField.kind === 'inherit') {
    return localField;
  }
  return syncField;
}

export function mergeBehaviorOverrides(
  syncOverrides: BehaviorOverrides,
  localOverrides: BehaviorOverrides,
): BehaviorOverrides {
  const merged: BehaviorOverrides = {};
  const speed = mergeOverrideField(syncOverrides.speed, localOverrides.speed);
  if (speed) {
    merged.speed = speed;
  }
  const overlayPosition = mergeOverrideField(
    syncOverrides.overlayPosition,
    localOverrides.overlayPosition,
  );
  if (overlayPosition) {
    merged.overlayPosition = overlayPosition;
  }
  const overlayAutoHide = mergeOverrideField(
    syncOverrides.overlayAutoHide,
    localOverrides.overlayAutoHide,
  );
  if (overlayAutoHide) {
    merged.overlayAutoHide = overlayAutoHide;
  }
  const overlayAutoHideDelayMs = mergeOverrideField(
    syncOverrides.overlayAutoHideDelayMs,
    localOverrides.overlayAutoHideDelayMs,
  );
  if (overlayAutoHideDelayMs) {
    merged.overlayAutoHideDelayMs = overlayAutoHideDelayMs;
  }

  const hotkeys: NonNullable<BehaviorOverrides['hotkeys']> = {};
  let hasHotkey = false;
  for (const action of SITE_HOTKEY_ACTIONS) {
    const field = mergeOverrideField(
      syncOverrides.hotkeys?.[action],
      localOverrides.hotkeys?.[action],
    );
    if (field) {
      hotkeys[action] = field;
      hasHotkey = true;
    }
  }
  if (hasHotkey) {
    merged.hotkeys = hotkeys;
  }
  return merged;
}

export function resolveOverride<T>(
  builtIn: T,
  globalOverride: Override<T> | undefined,
  siteOverride: Override<T> | undefined,
): ResolvedSetting<T> {
  if (siteOverride?.kind === 'value') {
    return { value: siteOverride.value, source: 'site' };
  }
  if (globalOverride?.kind === 'value') {
    return { value: globalOverride.value, source: 'global' };
  }
  return { value: builtIn, source: 'built-in' };
}

export function resolveSiteBehavior(
  globalOverrides: BehaviorOverrides = {},
  siteOverrides: BehaviorOverrides = {},
  policy: SpeedPolicy = DEFAULT_SPEED_POLICY,
): ResolvedSiteBehavior {
  const speedSource = resolveOverride(
    BUILT_IN_SITE_BEHAVIOR.speed,
    globalOverrides.speed,
    siteOverrides.speed,
  );
  return {
    speed: {
      value: resolveEffectiveSpeed(speedSource.value, policy),
      source: speedSource.source,
    },
    overlayPosition: resolveOverride(
      BUILT_IN_SITE_BEHAVIOR.overlayPosition,
      globalOverrides.overlayPosition,
      siteOverrides.overlayPosition,
    ),
    overlayAutoHide: resolveOverride(
      BUILT_IN_SITE_BEHAVIOR.overlayAutoHide,
      globalOverrides.overlayAutoHide,
      siteOverrides.overlayAutoHide,
    ),
    overlayAutoHideDelayMs: resolveOverride(
      BUILT_IN_SITE_BEHAVIOR.overlayAutoHideDelayMs,
      globalOverrides.overlayAutoHideDelayMs,
      siteOverrides.overlayAutoHideDelayMs,
    ),
    hotkeys: {},
  };
}

export function toEffectiveBehavior(resolved: ResolvedSiteBehavior): SiteBehavior {
  const hotkeys: SiteBehavior['hotkeys'] = {};
  for (const action of SITE_HOTKEY_ACTIONS) {
    const setting = resolved.hotkeys[action];
    if (setting) {
      hotkeys[action] = setting.value;
    }
  }
  return {
    speed: resolved.speed.value,
    overlayPosition: resolved.overlayPosition.value,
    overlayAutoHide: resolved.overlayAutoHide.value,
    overlayAutoHideDelayMs: resolved.overlayAutoHideDelayMs.value,
    hotkeys,
  };
}

export function behaviorOverridesEqual(left: BehaviorOverrides, right: BehaviorOverrides): boolean {
  return (
    fieldsEqual(left.speed, right.speed) &&
    fieldsEqual(left.overlayPosition, right.overlayPosition) &&
    fieldsEqual(left.overlayAutoHide, right.overlayAutoHide) &&
    fieldsEqual(left.overlayAutoHideDelayMs, right.overlayAutoHideDelayMs)
  );
}

function fieldsEqual<T>(left: Override<T> | undefined, right: Override<T> | undefined): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return overridesEqual(left, right);
}

export function withSpeedInherit(
  overrides: BehaviorOverrides,
  updatedAt: number,
): BehaviorOverrides {
  return { ...overrides, speed: { kind: 'inherit', updatedAt } };
}

export function withSpeedValue(
  overrides: BehaviorOverrides,
  speed: number,
  updatedAt: number,
): BehaviorOverrides {
  return { ...overrides, speed: { kind: 'value', value: speed, updatedAt } };
}
