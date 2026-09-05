// SPDX-License-Identifier: GPL-3.0-only

import type { SettingsParseResult } from './migrate';
import { hasOpaqueOverrideExtras } from './opaque-fields';

export function cannotSafelyDestroy<T>(parsed: SettingsParseResult<T>): boolean {
  return (
    parsed.status === 'unsupported' ||
    (parsed.status === 'ready' && hasOpaqueOverrideExtras(parsed.extras))
  );
}
