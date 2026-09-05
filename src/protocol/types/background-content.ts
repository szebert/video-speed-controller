// SPDX-License-Identifier: GPL-3.0-only

import type { HostPattern } from '../../access/site-access';
import type { AppliedTabBehavior } from '../../core/applied-tab-behavior';

export type ApplyTabBehaviorRequest = {
  type: 'APPLY_TAB_BEHAVIOR';
  behavior: AppliedTabBehavior;
};

export type ReconcileAccessRequest = {
  type: 'RECONCILE_ACCESS';
  allowedHostPatterns: HostPattern[];
};

export type BackgroundToContentRequest = ApplyTabBehaviorRequest | ReconcileAccessRequest;
