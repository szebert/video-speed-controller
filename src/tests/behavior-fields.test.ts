// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { BEHAVIOR_FIELDS, EDITABLE_BEHAVIOR_FIELDS } from '../settings/behavior-fields';
import { behaviorValueSchemas } from '../settings/behavior-schema';
import { BUILT_IN_SITE_BEHAVIOR } from '../settings/site-behavior';
import { LogicalBackupSchema } from '../settings/backup';

describe('behavior field registry', () => {
  it('keeps registry, storage schema, and editable keys in parity', () => {
    expect(Object.keys(BEHAVIOR_FIELDS)).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
    expect(Object.keys(behaviorValueSchemas)).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
    expect(Object.keys(BUILT_IN_SITE_BEHAVIOR).sort()).toEqual(
      [...EDITABLE_BEHAVIOR_FIELDS, 'hotkeys'].sort(),
    );
    expect(
      Object.keys(LogicalBackupSchema.shape.global.shape).filter((key) => key !== 'hotkeys'),
    ).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
    expect(LogicalBackupSchema.shape.global.shape).toHaveProperty('hotkeys');
  });

  it('files navigation fields under the existing playback and overlay categories', () => {
    for (const field of [
      'skipBackSeconds',
      'skipForwardSeconds',
      'skipScaleWithPlaybackRate',
      'rewindSpeed',
      'fastForwardSpeed',
    ] as const) {
      expect(BEHAVIOR_FIELDS[field].category).toBe('playback');
      expect(BEHAVIOR_FIELDS[field].reapply).toEqual({
        global: 'preserve-target',
        site: 'preserve-target',
      });
    }
    expect(BEHAVIOR_FIELDS.overlayNavigationBar.category).toBe('overlay');
    expect(new Set(Object.values(BEHAVIOR_FIELDS).map((field) => field.category))).toEqual(
      new Set(['playback', 'overlay', 'hotkeys']),
    );
  });
});
