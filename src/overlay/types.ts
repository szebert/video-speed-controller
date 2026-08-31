// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';

export type OverlayActions = {
  adjustSpeed(direction: -1 | 1): void;
};

export type OverlayControlsProps = {
  behavior: AppliedTabBehavior;
  onAdjust(direction: -1 | 1): void;
  onPointerActiveChange(active: boolean): void;
  onFocusWithinChange(focused: boolean): void;
};
