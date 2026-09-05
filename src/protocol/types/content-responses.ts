// SPDX-License-Identifier: GPL-3.0-only

export type IntentOutcome =
  { ok: true; persistError?: string; reapplyError?: string } | { ok: false; error: string };

export type FrameReadyOutcome = { action: 'applied' } | { action: 'dormant' };
