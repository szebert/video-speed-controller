// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { BEHAVIOR_FIELDS, EDITABLE_BEHAVIOR_FIELDS } from '../settings/behavior-fields';
import { behaviorValueSchemas } from '../settings/behavior-schema';

describe('behavior field registry', () => {
  it('keeps registry, storage schema, and editable keys in parity', () => {
    expect(Object.keys(BEHAVIOR_FIELDS)).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
    expect(Object.keys(behaviorValueSchemas)).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
  });
});
