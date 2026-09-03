// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { SpeedPolicy } from '../core/speed';
import type { OverlayPosition } from '../settings/site-behavior';

export type OverlayActions = {
  adjustSpeed(direction: -1 | 1): void;
  setOverlayPosition?(position: OverlayPosition): void;
  openSettings?(): void;
};

export type OverlayControlsProps = {
  behavior: AppliedTabBehavior;
  policy?: SpeedPolicy;
  visible?: boolean;
  onAdjust(direction: -1 | 1): void;
  onSetPosition(position: OverlayPosition): void;
  onOpenSettings(): void;
};
