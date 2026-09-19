// SPDX-License-Identifier: GPL-3.0-only

import type { BehaviorSettingsSnapshot } from '../../protocol/schemas/shared';
import { t } from '@/i18n/t';
import { builtInEffectiveHotkeys, hotkeyBindingsEqual } from '../../settings/hotkey-binding';
import {
  BUILT_IN_SITE_BEHAVIOR,
  OVERLAY_POSITION,
  revalidateResolvedSpeed,
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
export type DraftKey =
  | 'speedMin'
  | 'speedMax'
  | 'speedTick'
  | 'skipBackSeconds'
  | 'skipForwardSeconds'
  | 'fastForwardSpeed'
  | 'delay'
  | 'flashDelay'
  | 'hotkeyRepeatDelay';
export type BooleanBehaviorFieldName =
  | 'overlayVisible'
  | 'overlayPositionButton'
  | 'overlaySettingsButton'
  | 'overlayNavigationBar'
  | 'overlayHotkeyHints'
  | 'overlayAutoHide'
  | 'overlayHoverHold'
  | 'skipScaleWithPlaybackRate'
  | 'buttonFlash'
  | 'hotkeyFlash'
  | 'hotkeyRepeat';
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

const NUMBER_INPUT_STEP_EPSILON = 1e-8;

function formatNumberInputValue(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function almostEqualNumberInput(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    NUMBER_INPUT_STEP_EPSILON * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function isIncompleteNumberDraft(raw: string): boolean {
  return raw === '' || !Number.isFinite(Number(raw)) || /[eE.+-]$/.test(raw);
}

function nextZeroGridTick(current: number, step: number, direction: 1 | -1): number {
  const ticksFromZero = current / step;
  const nearest = Math.round(ticksFromZero);
  if (Math.abs(ticksFromZero - nearest) <= NUMBER_INPUT_STEP_EPSILON) {
    return Number(((nearest + direction) * step).toPrecision(12));
  }
  if (direction > 0) {
    return Number((Math.ceil(ticksFromZero - NUMBER_INPUT_STEP_EPSILON) * step).toPrecision(12));
  }
  return Number((Math.floor(ticksFromZero + NUMBER_INPUT_STEP_EPSILON) * step).toPrecision(12));
}

function isZeroGridStep(
  previous: number,
  next: number,
  min: number,
  max: number,
  step: number,
): boolean {
  const nativeMin = numberInputMin(min, step);
  const up = Math.min(max, nextZeroGridTick(previous, step, 1));
  const down = Math.max(nativeMin, nextZeroGridTick(previous, step, -1));
  return almostEqualNumberInput(next, up) || almostEqualNumberInput(next, down);
}

/**
 * Native `<input type="number">` uses `min` as the step base (`min + n * step`).
 * When the stored minimum is off the 0-based tick grid, expose the previous
 * 0-aligned tick so spinner buttons stay on 0, step, 2*step, … The real
 * minimum is enforced on step and commit.
 */
export function numberInputMin(min: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(min)) {
    return min;
  }
  const ticksFromZero = min / step;
  if (Math.abs(ticksFromZero - Math.round(ticksFromZero)) <= NUMBER_INPUT_STEP_EPSILON) {
    return min;
  }
  return Number((Math.floor(ticksFromZero + NUMBER_INPUT_STEP_EPSILON) * step).toPrecision(12));
}

export function numberInputSteppedValue(
  current: number,
  min: number,
  max: number,
  step: number,
  direction: 1 | -1,
): string {
  const next = nextZeroGridTick(current, step, direction);
  return formatNumberInputValue(Math.min(max, Math.max(min, next)));
}

export function numberInputDraftAfterChange(
  previous: string,
  next: string,
  min: number,
  max: number,
  step: number,
): string {
  if (isIncompleteNumberDraft(next)) {
    return next;
  }
  const previousNumber = Number(previous);
  const nextNumber = Number(next);
  if (
    !Number.isFinite(previousNumber) ||
    !isZeroGridStep(previousNumber, nextNumber, min, max, step)
  ) {
    return next;
  }
  return formatNumberInputValue(Math.min(max, Math.max(min, nextNumber)));
}

export function handleNumberInputKeyDown(
  event: { key: string; preventDefault: () => void },
  current: string,
  min: number,
  max: number,
  step: number,
  onDraft: (value: string) => void,
  onCommit: () => void,
): void {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const parsed = Number(current);
    const base = Number.isFinite(parsed) ? parsed : min;
    onDraft(numberInputSteppedValue(base, min, max, step, event.key === 'ArrowUp' ? 1 : -1));
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    onCommit();
  }
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
      return revalidateResolvedSpeed({
        ...behavior,
        [change.field]: snapshot.global[change.field],
      });
    }
    return revalidateResolvedSpeed({
      ...behavior,
      [change.field]: { value: BUILT_IN_SITE_BEHAVIOR[change.field], source: 'built-in' },
    });
  }
  return revalidateResolvedSpeed({
    ...behavior,
    [change.field]: {
      value: change.value,
      source: selection.kind === 'site' ? 'site' : 'global',
    },
  });
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
    // Navigation actions have no built-in binding. Reading BUILT_IN_HOTKEYS
    // directly would yield undefined for them.
    return {
      ...hotkeys,
      [change.action]: { value: builtInEffectiveHotkeys()[change.action], source: 'built-in' },
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
