// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { SpeedPolicy } from '../core/speed';

export type OverlayActions = {
  adjustSpeed(direction: -1 | 1): void;
};

export type OverlayControlsProps = {
  behavior: AppliedTabBehavior;
  policy?: SpeedPolicy;
  onAdjust(direction: -1 | 1): void;
  onPointerActiveChange(active: boolean): void;
  onFocusWithinChange(focused: boolean): void;
};
