// SPDX-License-Identifier: GPL-3.0-only

import type { BehaviorSettingsSnapshot } from '../../protocol/schemas/shared';
import { t } from '@/i18n/t';
import { BUILT_IN_HOTKEYS, hotkeyBindingsEqual } from '../../settings/hotkey-binding';
import {
  BUILT_IN_SITE_BEHAVIOR,
  OVERLAY_POSITION,
  type BehaviorSettingChange,
  type EditableBehaviorField,
  type EditableResolvedBehavior,
  type HotkeySettingChange,
  type OverlayPosition,
  type ResolvedHotkeyMap,
  type SettingSource,
  type SiteHotkeyAction,
} from '../../settings/site-behavior';
import { normalizeSiteHostname } from '../../settings/site-hostname';

export type Selection =
  { kind: 'settings' } | { kind: 'global' } | { kind: 'site'; hostname: string };
export type DraftKey = 'speedMin' | 'speedMax' | 'speedTick' | 'delay';
export type OverlaySwitchFieldName =
  | 'overlayVisible'
  | 'overlayPositionButton'
  | 'overlaySettingsButton'
  | 'overlayAutoHide'
  | 'overlayHoverHold';
export type RecoverKind = 'pane' | 'sidebar' | 'pane-and-sidebar';

export const POSITION_OPTIONS: { value: OverlayPosition; labelKey: Parameters<typeof t>[0] }[] = [
  { value: OVERLAY_POSITION.TOP_LEFT, labelKey: 'positionTopLeft' },
  { value: OVERLAY_POSITION.TOP_CENTER, labelKey: 'positionTopCenter' },
  { value: OVERLAY_POSITION.TOP_RIGHT, labelKey: 'positionTopRight' },
  { value: OVERLAY_POSITION.CENTER_LEFT, labelKey: 'positionCenterLeft' },
  { value: OVERLAY_POSITION.CENTER, labelKey: 'positionCenter' },
  { value: OVERLAY_POSITION.CENTER_RIGHT, labelKey: 'positionCenterRight' },
  { value: OVERLAY_POSITION.BOTTOM_LEFT, labelKey: 'positionBottomLeft' },
  { value: OVERLAY_POSITION.BOTTOM_CENTER, labelKey: 'positionBottomCenter' },
  { value: OVERLAY_POSITION.BOTTOM_RIGHT, labelKey: 'positionBottomRight' },
];

export function focusedHostnameFromLocation(): string | null {
  return normalizeSiteHostname(new URL(window.location.href).searchParams.get('site'));
}

export function ownsOverride(selection: Selection, source: SettingSource): boolean {
  return (
    (selection.kind === 'global' && source === 'global') ||
    (selection.kind === 'site' && source === 'site')
  );
}

export function resetFieldLabel(fieldLabel: string): string {
  return `${t('reset')}: ${fieldLabel}`;
}

export function showsInherited(
  selection: Selection,
  source: SettingSource,
  draft?: string,
): boolean {
  return !ownsOverride(selection, source) && draft == null;
}

export function currentBehavior(
  snapshot: BehaviorSettingsSnapshot,
  selection: Selection,
): EditableResolvedBehavior {
  if (selection.kind === 'site' && snapshot.site?.hostname === selection.hostname) {
    return snapshot.site.behavior;
  }
  return snapshot.global;
}

export function applyOptimisticChange(
  behavior: EditableResolvedBehavior,
  change: BehaviorSettingChange,
  selection: Selection,
  snapshot: BehaviorSettingsSnapshot,
): EditableResolvedBehavior {
  if (change.kind === 'inherit') {
    if (selection.kind === 'site') {
      return { ...behavior, [change.field]: snapshot.global[change.field] };
    }
    return {
      ...behavior,
      [change.field]: { value: BUILT_IN_SITE_BEHAVIOR[change.field], source: 'built-in' },
    };
  }
  return {
    ...behavior,
    [change.field]: {
      value: change.value,
      source: selection.kind === 'site' ? 'site' : 'global',
    },
  };
}

export function applyOptimisticChanges(
  behavior: EditableResolvedBehavior,
  changes: Partial<Record<EditableBehaviorField, BehaviorSettingChange>>,
  selection: Selection,
  snapshot: BehaviorSettingsSnapshot,
): EditableResolvedBehavior {
  let next = behavior;
  for (const change of Object.values(changes)) {
    if (change) {
      next = applyOptimisticChange(next, change, selection, snapshot);
    }
  }
  return next;
}

export function sameBehaviorSettingChange(
  left: BehaviorSettingChange | undefined,
  right: BehaviorSettingChange,
): boolean {
  if (!left || left.kind !== right.kind || left.field !== right.field) {
    return false;
  }
  if (left.kind === 'inherit' || right.kind === 'inherit') {
    return left.kind === 'inherit' && right.kind === 'inherit';
  }
  return left.value === right.value;
}

export function omitMatchingOptimisticChanges(
  current: Partial<Record<EditableBehaviorField, BehaviorSettingChange>>,
  sent: readonly BehaviorSettingChange[],
): Partial<Record<EditableBehaviorField, BehaviorSettingChange>> {
  const next = { ...current };
  for (const change of sent) {
    if (sameBehaviorSettingChange(next[change.field], change)) {
      delete next[change.field];
    }
  }
  return next;
}

export function currentHotkeys(
  snapshot: BehaviorSettingsSnapshot,
  selection: Selection,
): ResolvedHotkeyMap {
  if (selection.kind === 'site' && snapshot.site?.hostname === selection.hostname) {
    return snapshot.site.hotkeys;
  }
  return snapshot.globalHotkeys;
}

export function applyOptimisticHotkeyChange(
  hotkeys: ResolvedHotkeyMap,
  change: HotkeySettingChange,
  selection: Selection,
  snapshot: BehaviorSettingsSnapshot,
): ResolvedHotkeyMap {
  if (change.kind === 'hotkey-inherit') {
    if (selection.kind === 'site') {
      return { ...hotkeys, [change.action]: snapshot.globalHotkeys[change.action] };
    }
    return {
      ...hotkeys,
      [change.action]: { value: { ...BUILT_IN_HOTKEYS[change.action] }, source: 'built-in' },
    };
  }
  return {
    ...hotkeys,
    [change.action]: {
      value: change.value,
      source: selection.kind === 'site' ? 'site' : 'global',
    },
  };
}

export function applyOptimisticHotkeyChanges(
  hotkeys: ResolvedHotkeyMap,
  changes: Partial<Record<SiteHotkeyAction, HotkeySettingChange>>,
  selection: Selection,
  snapshot: BehaviorSettingsSnapshot,
): ResolvedHotkeyMap {
  let next = hotkeys;
  for (const change of Object.values(changes)) {
    if (change) {
      next = applyOptimisticHotkeyChange(next, change, selection, snapshot);
    }
  }
  return next;
}

export function sameHotkeySettingChange(
  left: HotkeySettingChange | undefined,
  right: HotkeySettingChange,
): boolean {
  if (!left || left.kind !== right.kind || left.action !== right.action) {
    return false;
  }
  if (left.kind === 'hotkey-inherit' || right.kind === 'hotkey-inherit') {
    return left.kind === 'hotkey-inherit' && right.kind === 'hotkey-inherit';
  }
  return hotkeyBindingsEqual(left.value, right.value);
}

export function omitMatchingOptimisticHotkeys(
  current: Partial<Record<SiteHotkeyAction, HotkeySettingChange>>,
  sent: HotkeySettingChange,
): Partial<Record<SiteHotkeyAction, HotkeySettingChange>> {
  if (sameHotkeySettingChange(current[sent.action], sent)) {
    const next = { ...current };
    delete next[sent.action];
    return next;
  }
  return current;
}
