// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import type { OverlayPosition } from '../settings/site-behavior';

export type OverlayActions = {
  adjustSpeed(direction: -1 | 1): void;
  setOverlayPosition?(position: OverlayPosition): void;
  openSettings?(): void;
};

export type OverlayViewCallbacks = {
  onAdjust(direction: -1 | 1): void;
  onSetPosition(position: OverlayPosition): void;
  onOpenSettings(): void;
  onInteractiveChange(active: boolean): void;
};

export type OverlayViewState = {
  behavior: AppliedTabBehavior;
  visible: boolean;
  hotkeys?: EffectiveHotkeyMap | null;
};
