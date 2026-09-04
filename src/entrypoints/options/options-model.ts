// SPDX-License-Identifier: GPL-3.0-only

import type { BehaviorSettingsSnapshot } from '../../core/messages';
import { t } from '@/i18n/t';
import {
  OVERLAY_POSITION,
  type EditableResolvedBehavior,
  type OverlayPosition,
  type SettingSource,
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
