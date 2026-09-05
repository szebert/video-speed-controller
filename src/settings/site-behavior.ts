// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_SPEED_POLICY,
  SPEED_MAX_SETTING_MAX,
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MAX,
  SPEED_MIN_SETTING_MIN,
  SPEED_TICK_SETTING_MAX,
  SPEED_TICK_SETTING_MIN,
  canonicalizeSpeed,
  clampPolicyNumber,
  clampSpeed,
  resolveEffectiveSpeed,
  speedPolicyFrom,
  type SpeedPolicy,
} from '../core/speed';
import {
  BEHAVIOR_FIELDS,
  BOOLEAN_BEHAVIOR_FIELDS,
  EDITABLE_BEHAVIOR_FIELDS,
  type BooleanBehaviorField,
  type EditableBehaviorField,
} from './behavior-fields';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SITE_INHERIT_SYNC_RETENTION_MS = 30 * DAY_MS;
export const LOCAL_LRU_THROTTLE_MS = 60 * 1000;
export const SYNC_LRU_STALE_MS = 24 * 60 * 60 * 1000;
export const REPAIR_BACKOFF_MS = 5 * 60 * 1000;
export const SYNC_TARGET_MAX_SITE_ITEMS = 400;
export const SYNC_TARGET_MAX_BYTES = 80 * 1024;

export const GLOBAL_BEHAVIOR_KEY = 'defaults:site-behavior';
export const THEME_KEY = 'pref:theme';

/** Shortest overlay auto-hide delay the product accepts (0.1s). */
export const OVERLAY_AUTO_HIDE_DELAY_MS_MIN = 100;
/** Longest overlay auto-hide delay the product accepts (5 min). */
export const OVERLAY_AUTO_HIDE_DELAY_MS_MAX = 5 * 60 * 1000;

export function canonicalizeOverlayAutoHideDelayMs(value: number): number {
  return Math.min(
    OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
    Math.max(OVERLAY_AUTO_HIDE_DELAY_MS_MIN, Math.round(value)),
  );
}

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
  speedMin: number;
  speedMax: number;
  speedTick: number;
  overlayVisible: boolean;
  overlayPosition: OverlayPosition;
  overlayPositionButton: boolean;
  overlaySettingsButton: boolean;
  overlayAutoHide: boolean;
  overlayHoverHold: boolean;
  overlayAutoHideDelayMs: number;
  hotkeys: Partial<Record<SiteHotkeyAction, HotkeyBinding | null>>;
};

export type Override<T> =
  { kind: 'value'; value: T; updatedAt: number } | { kind: 'inherit'; updatedAt: number };

export type BehaviorOverrides = {
  speed?: Override<number>;
  speedMin?: Override<number>;
  speedMax?: Override<number>;
  speedTick?: Override<number>;
  overlayVisible?: Override<boolean>;
  overlayPosition?: Override<OverlayPosition>;
  overlayPositionButton?: Override<boolean>;
  overlaySettingsButton?: Override<boolean>;
  overlayAutoHide?: Override<boolean>;
  overlayHoverHold?: Override<boolean>;
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
  speedMin: ResolvedSetting<number>;
  speedMax: ResolvedSetting<number>;
  speedTick: ResolvedSetting<number>;
  overlayVisible: ResolvedSetting<boolean>;
  overlayPosition: ResolvedSetting<OverlayPosition>;
  overlayPositionButton: ResolvedSetting<boolean>;
  overlaySettingsButton: ResolvedSetting<boolean>;
  overlayAutoHide: ResolvedSetting<boolean>;
  overlayHoverHold: ResolvedSetting<boolean>;
  overlayAutoHideDelayMs: ResolvedSetting<number>;
  hotkeys: Partial<Record<SiteHotkeyAction, ResolvedSetting<HotkeyBinding | null>>>;
};

export const BUILT_IN_SITE_BEHAVIOR = {
  hotkeys: {},
  ...Object.fromEntries(
    EDITABLE_BEHAVIOR_FIELDS.map((field) => [field, BEHAVIOR_FIELDS[field].default]),
  ),
} as SiteBehavior;

export function isOverlayPosition(value: unknown): value is OverlayPosition {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 8;
}

export function isSiteHotkeyAction(value: unknown): value is SiteHotkeyAction {
  return typeof value === 'string' && (SITE_HOTKEY_ACTIONS as readonly string[]).includes(value);
}

export function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

export function isOverride<T>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is T,
): value is Override<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as { kind?: unknown; value?: unknown; updatedAt?: unknown };
  if (!isFiniteTimestamp(record.updatedAt)) {
    return false;
  }
  if (record.kind === 'inherit') {
    return hasExactKeys(record, ['kind', 'updatedAt']);
  }
  return (
    record.kind === 'value' &&
    hasExactKeys(record, ['kind', 'value', 'updatedAt']) &&
    isValue(record.value)
  );
}

export function isNonNegativeIntegerMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function hasHotkeyEntries(overrides: BehaviorOverrides): boolean {
  const hotkeys = overrides.hotkeys;
  if (!hotkeys) {
    return false;
  }
  return Object.keys(hotkeys).length > 0;
}

export function listOverrides(overrides: BehaviorOverrides): Override<unknown>[] {
  const listed: Override<unknown>[] = [];
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    const current = overrides[field];
    if (current) {
      listed.push(current);
    }
  }
  if (overrides.hotkeys) {
    for (const action of SITE_HOTKEY_ACTIONS) {
      const current = overrides.hotkeys[action];
      if (current) {
        listed.push(current);
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
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    const current = record.overrides[field];
    if (current && !isExpiredSiteInherit(current, now)) {
      Object.assign(overrides, { [field]: current });
    }
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
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    const next = mergeOverrideField<SiteBehavior[typeof field]>(
      syncOverrides[field] as Override<SiteBehavior[typeof field]> | undefined,
      localOverrides[field] as Override<SiteBehavior[typeof field]> | undefined,
    );
    if (next) {
      Object.assign(merged, { [field]: next });
    }
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

function clampResolvedOverlayAutoHideDelay(
  setting: ResolvedSetting<number>,
): ResolvedSetting<number> {
  const value = canonicalizeOverlayAutoHideDelayMs(setting.value);
  return value === setting.value ? setting : { ...setting, value };
}

export function resolveSiteBehavior(
  globalOverrides: BehaviorOverrides = {},
  siteOverrides: BehaviorOverrides = {},
  policy?: SpeedPolicy,
): ResolvedSiteBehavior {
  const resolved = { hotkeys: {} } as ResolvedSiteBehavior;
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    Object.assign(resolved, {
      [field]: resolveOverride(
        BUILT_IN_SITE_BEHAVIOR[field],
        globalOverrides[field] as Override<SiteBehavior[typeof field]> | undefined,
        siteOverrides[field] as Override<SiteBehavior[typeof field]> | undefined,
      ),
    });
  }
  const effectivePolicy =
    policy ??
    speedPolicyFrom({
      min: resolved.speedMin.value,
      max: resolved.speedMax.value,
      tick: resolved.speedTick.value,
    });
  resolved.speed = {
    value: resolveEffectiveSpeed(resolved.speed.value, effectivePolicy),
    source: resolved.speed.source,
  };
  resolved.overlayAutoHideDelayMs = clampResolvedOverlayAutoHideDelay(
    resolved.overlayAutoHideDelayMs,
  );
  return resolved;
}

export function toEffectiveBehavior(resolved: ResolvedSiteBehavior): SiteBehavior {
  const hotkeys: SiteBehavior['hotkeys'] = {};
  for (const action of SITE_HOTKEY_ACTIONS) {
    const setting = resolved.hotkeys[action];
    if (setting) {
      hotkeys[action] = setting.value;
    }
  }
  const effective = { hotkeys } as SiteBehavior;
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    Object.assign(effective, { [field]: resolved[field].value });
  }
  return effective;
}

export function behaviorOverridesEqual(left: BehaviorOverrides, right: BehaviorOverrides): boolean {
  return (
    EDITABLE_BEHAVIOR_FIELDS.every((field) =>
      fieldsEqual(
        left[field] as Override<unknown> | undefined,
        right[field] as Override<unknown> | undefined,
      ),
    ) &&
    SITE_HOTKEY_ACTIONS.every((action) =>
      fieldsEqual(left.hotkeys?.[action], right.hotkeys?.[action]),
    )
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

export type { EditableBehaviorField };

export { BOOLEAN_BEHAVIOR_FIELDS, EDITABLE_BEHAVIOR_FIELDS };

export function isBooleanBehaviorField(
  field: EditableBehaviorField,
): field is BooleanBehaviorField {
  return (BOOLEAN_BEHAVIOR_FIELDS as readonly string[]).includes(field);
}

export type EditableResolvedBehavior = Pick<ResolvedSiteBehavior, EditableBehaviorField>;

export type BehaviorSettingChange =
  | { kind: 'value'; field: 'speed'; value: number }
  | { kind: 'value'; field: 'speedMin'; value: number }
  | { kind: 'value'; field: 'speedMax'; value: number }
  | { kind: 'value'; field: 'speedTick'; value: number }
  | { kind: 'value'; field: 'overlayVisible'; value: boolean }
  | { kind: 'value'; field: 'overlayPosition'; value: OverlayPosition }
  | { kind: 'value'; field: 'overlayPositionButton'; value: boolean }
  | { kind: 'value'; field: 'overlaySettingsButton'; value: boolean }
  | { kind: 'value'; field: 'overlayAutoHide'; value: boolean }
  | { kind: 'value'; field: 'overlayHoverHold'; value: boolean }
  | { kind: 'value'; field: 'overlayAutoHideDelayMs'; value: number }
  | { kind: 'inherit'; field: EditableBehaviorField };

export function hasValueOverrides(overrides: BehaviorOverrides): boolean {
  return listOverrides(overrides).some((override) => override.kind === 'value');
}

export function isEditableBehaviorField(value: unknown): value is EditableBehaviorField {
  return (
    typeof value === 'string' && (EDITABLE_BEHAVIOR_FIELDS as readonly string[]).includes(value)
  );
}

export function speedPolicyFromResolved(
  behavior: Pick<ResolvedSiteBehavior, 'speedMin' | 'speedMax' | 'speedTick'>,
): SpeedPolicy {
  return speedPolicyFrom({
    min: behavior.speedMin.value,
    max: behavior.speedMax.value,
    tick: behavior.speedTick.value,
  });
}

export function toEditableResolvedBehavior(
  resolved: ResolvedSiteBehavior,
): EditableResolvedBehavior {
  const editable = {} as EditableResolvedBehavior;
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    Object.assign(editable, { [field]: resolved[field] });
  }
  return editable;
}

export function tombstoneExistingSiteFields(
  current: BehaviorOverrides,
  updatedAt: number,
): BehaviorOverrides {
  const next: BehaviorOverrides = {};
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    if (current[field]) {
      next[field] = { kind: 'inherit', updatedAt };
    }
  }
  return next;
}

export function inheritAllEditableFields(updatedAt: number): BehaviorOverrides {
  const overrides: BehaviorOverrides = {};
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    overrides[field] = { kind: 'inherit', updatedAt };
  }
  return overrides;
}

export function applyBehaviorSettingChange(
  current: BehaviorOverrides,
  change: BehaviorSettingChange,
  updatedAt: number,
): BehaviorOverrides {
  if (change.kind === 'inherit') {
    return { ...current, [change.field]: { kind: 'inherit', updatedAt } };
  }
  return {
    ...current,
    [change.field]: { kind: 'value', value: change.value, updatedAt },
  };
}

export function withSpeedInherit(
  overrides: BehaviorOverrides,
  updatedAt: number,
): BehaviorOverrides {
  return applyBehaviorSettingChange(overrides, { kind: 'inherit', field: 'speed' }, updatedAt);
}

export function withSpeedValue(
  overrides: BehaviorOverrides,
  speed: number,
  updatedAt: number,
): BehaviorOverrides {
  return applyBehaviorSettingChange(
    overrides,
    { kind: 'value', field: 'speed', value: speed },
    updatedAt,
  );
}

export function canonicalizeBehaviorSettingChange(
  change: BehaviorSettingChange,
): BehaviorSettingChange | null {
  if (!isEditableBehaviorField(change.field)) {
    return null;
  }
  if (change.kind === 'inherit') {
    return { kind: 'inherit', field: change.field };
  }
  if (change.field === 'speed') {
    if (typeof change.value !== 'number' || !Number.isFinite(change.value)) {
      return null;
    }
    return {
      kind: 'value',
      field: 'speed',
      value: canonicalizeSpeed(
        clampSpeed(change.value, {
          ...DEFAULT_SPEED_POLICY,
          min: SPEED_MIN_SETTING_MIN,
          max: SPEED_MAX_SETTING_MAX,
        }),
      ),
    };
  }
  if (change.field === 'speedMin') {
    if (typeof change.value !== 'number' || !Number.isFinite(change.value)) {
      return null;
    }
    return {
      kind: 'value',
      field: 'speedMin',
      value: clampPolicyNumber(change.value, SPEED_MIN_SETTING_MIN, SPEED_MIN_SETTING_MAX),
    };
  }
  if (change.field === 'speedMax') {
    if (typeof change.value !== 'number' || !Number.isFinite(change.value)) {
      return null;
    }
    return {
      kind: 'value',
      field: 'speedMax',
      value: clampPolicyNumber(change.value, SPEED_MAX_SETTING_MIN, SPEED_MAX_SETTING_MAX),
    };
  }
  if (change.field === 'speedTick') {
    if (typeof change.value !== 'number' || !Number.isFinite(change.value)) {
      return null;
    }
    return {
      kind: 'value',
      field: 'speedTick',
      value: clampPolicyNumber(change.value, SPEED_TICK_SETTING_MIN, SPEED_TICK_SETTING_MAX),
    };
  }
  if (change.field === 'overlayPosition') {
    return isOverlayPosition(change.value) ? change : null;
  }
  if (isBooleanBehaviorField(change.field)) {
    return typeof change.value === 'boolean' ? change : null;
  }
  if (typeof change.value !== 'number' || !Number.isFinite(change.value) || change.value < 0) {
    return null;
  }
  return {
    kind: 'value',
    field: 'overlayAutoHideDelayMs',
    value: canonicalizeOverlayAutoHideDelayMs(change.value),
  };
}
