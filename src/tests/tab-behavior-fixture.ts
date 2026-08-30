// SPDX-License-Identifier: GPL-3.0-only

import { builtInAppliedTabBehavior, type AppliedTabBehavior } from '../core/applied-tab-behavior';

export function tabBehavior(
  targetSpeed: number,
  extras: Partial<AppliedTabBehavior> = {},
): AppliedTabBehavior {
  return { ...builtInAppliedTabBehavior(targetSpeed), ...extras };
}
