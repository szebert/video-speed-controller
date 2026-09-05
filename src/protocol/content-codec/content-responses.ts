// SPDX-License-Identifier: GPL-3.0-only

import type { FrameReadyOutcome, IntentOutcome } from '../types/content-responses';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseIntentOutcome(value: unknown): IntentOutcome | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.ok === false) {
    return { ok: false, error: typeof value.error === 'string' ? value.error : 'Request failed' };
  }
  if (value.ok !== true) {
    return null;
  }
  const persistError = typeof value.persistError === 'string' ? value.persistError : undefined;
  const reapplyError = typeof value.reapplyError === 'string' ? value.reapplyError : undefined;
  return {
    ok: true,
    ...(persistError ? { persistError } : {}),
    ...(reapplyError ? { reapplyError } : {}),
  };
}

export function intentOutcomeFailureMessage(outcome: IntentOutcome): string | null {
  if (!outcome.ok) {
    return outcome.error;
  }
  return outcome.reapplyError ?? outcome.persistError ?? null;
}

export function parseFrameReadyOutcome(value: unknown): FrameReadyOutcome | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.action === 'applied' || value.action === 'dormant') {
    return { action: value.action };
  }
  return null;
}
