// SPDX-License-Identifier: GPL-3.0-only

import { listIncludes } from '../types/narrow';

export const SITE_HOTKEY_ACTIONS = [
  'openSettings',
  'increaseSpeed',
  'decreaseSpeed',
  'resetSpeed',
  'resetSpeedToOne',
  'jumpToStart',
  'rewind',
  'skipBack',
  'playPause',
  'skipForward',
  'fastForward',
  'jumpToEnd',
  'toggleMute',
  'decreaseVolume',
  'increaseVolume',
  'markA',
  'clearMarkA',
  'jumpToA',
  'markB',
  'clearMarkB',
  'jumpToB',
  'toggleLoop',
  'toggleFullscreen',
  'jumpTo10Percent',
  'jumpTo20Percent',
  'jumpTo30Percent',
  'jumpTo40Percent',
  'jumpTo50Percent',
  'jumpTo60Percent',
  'jumpTo70Percent',
  'jumpTo80Percent',
  'jumpTo90Percent',
] as const;

export type SiteHotkeyAction = (typeof SITE_HOTKEY_ACTIONS)[number];

export function isSiteHotkeyAction(value: unknown): value is SiteHotkeyAction {
  return typeof value === 'string' && listIncludes(SITE_HOTKEY_ACTIONS, value);
}

// The explicit constructor is checked against the action tuple's derived type.
// This leaf module owns identity without importing behavior or binding models.
export function mapHotkeyActions<T>(
  valueFor: (action: SiteHotkeyAction) => T,
): Record<SiteHotkeyAction, T> {
  return {
    openSettings: valueFor('openSettings'),
    decreaseSpeed: valueFor('decreaseSpeed'),
    increaseSpeed: valueFor('increaseSpeed'),
    resetSpeed: valueFor('resetSpeed'),
    resetSpeedToOne: valueFor('resetSpeedToOne'),
    jumpToStart: valueFor('jumpToStart'),
    rewind: valueFor('rewind'),
    skipBack: valueFor('skipBack'),
    playPause: valueFor('playPause'),
    skipForward: valueFor('skipForward'),
    fastForward: valueFor('fastForward'),
    jumpToEnd: valueFor('jumpToEnd'),
    toggleMute: valueFor('toggleMute'),
    decreaseVolume: valueFor('decreaseVolume'),
    increaseVolume: valueFor('increaseVolume'),
    markA: valueFor('markA'),
    clearMarkA: valueFor('clearMarkA'),
    jumpToA: valueFor('jumpToA'),
    markB: valueFor('markB'),
    clearMarkB: valueFor('clearMarkB'),
    jumpToB: valueFor('jumpToB'),
    toggleLoop: valueFor('toggleLoop'),
    toggleFullscreen: valueFor('toggleFullscreen'),
    jumpTo10Percent: valueFor('jumpTo10Percent'),
    jumpTo20Percent: valueFor('jumpTo20Percent'),
    jumpTo30Percent: valueFor('jumpTo30Percent'),
    jumpTo40Percent: valueFor('jumpTo40Percent'),
    jumpTo50Percent: valueFor('jumpTo50Percent'),
    jumpTo60Percent: valueFor('jumpTo60Percent'),
    jumpTo70Percent: valueFor('jumpTo70Percent'),
    jumpTo80Percent: valueFor('jumpTo80Percent'),
    jumpTo90Percent: valueFor('jumpTo90Percent'),
  };
}
