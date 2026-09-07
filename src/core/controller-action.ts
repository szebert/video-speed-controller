// SPDX-License-Identifier: GPL-3.0-only

import { isSiteHotkeyAction, type SiteHotkeyAction } from '../settings/site-behavior';

/** Actions that can have a stored binding. */
export type { SiteHotkeyAction };

/** Actions content can execute. V1 aliases stored bindings; later grows media-local actions. */
export type ControllerAction = SiteHotkeyAction;

/** Actions that may cross DISPATCH_TAB_ACTION. Stays the tab-wide speed subset. */
export type TabSpeedAction = SiteHotkeyAction;

export const TAB_SPEED_ACTIONS = [
  'increaseSpeed',
  'decreaseSpeed',
  'resetSpeed',
] as const satisfies readonly TabSpeedAction[];

export function isControllerAction(value: unknown): value is ControllerAction {
  return isSiteHotkeyAction(value);
}

export function isTabSpeedAction(value: unknown): value is TabSpeedAction {
  return isSiteHotkeyAction(value);
}
