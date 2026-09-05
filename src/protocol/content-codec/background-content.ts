// SPDX-License-Identifier: GPL-3.0-only

import { isAppliedTabBehavior } from '../../core/applied-tab-behavior';
import type {
  ApplyTabBehaviorRequest,
  BackgroundToContentRequest,
  ReconcileAccessRequest,
} from '../types/background-content';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isApplyTabBehaviorRequest(
  value: Record<string, unknown>,
): value is ApplyTabBehaviorRequest {
  return isAppliedTabBehavior(value.behavior);
}

function isReconcileAccessRequest(value: Record<string, unknown>): value is ReconcileAccessRequest {
  return (
    Array.isArray(value.allowedHostPatterns) &&
    value.allowedHostPatterns.every((pattern) => typeof pattern === 'string')
  );
}

export function parseBackgroundToContent(value: unknown): BackgroundToContentRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  switch (value.type) {
    case 'APPLY_TAB_BEHAVIOR':
      return isApplyTabBehaviorRequest(value) ? value : null;
    case 'RECONCILE_ACCESS':
      return isReconcileAccessRequest(value) ? value : null;
    default:
      return null;
  }
}
