// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BEHAVIOR_FIELDS,
  EDITABLE_BEHAVIOR_FIELDS,
  mapBehaviorFields,
  type BehaviorField,
} from '../settings/behavior-fields';
import { behaviorValueSchemas } from '../settings/behavior-schema';
import { BUILT_IN_SITE_BEHAVIOR, type SiteBehavior } from '../settings/site-behavior';
import { LogicalBackupSchema } from '../settings/backup';

describe('behavior field registry', () => {
  it('preserves per-field types and requires a value for every behavior field', () => {
    type Fields = Pick<SiteBehavior, BehaviorField>;
    const fields = mapBehaviorFields<Fields>((field) => BUILT_IN_SITE_BEHAVIOR[field]);
    expectTypeOf(fields).toEqualTypeOf<Fields>();
    expectTypeOf(fields.speed).toEqualTypeOf<number>();
    expectTypeOf(fields.rememberLastSpeed).toEqualTypeOf<boolean>();
    // @ts-expect-error A mapper cannot supply strings where numbers/booleans are required.
    mapBehaviorFields<Fields>(() => 'invalid');
    // @ts-expect-error A partial model cannot omit the remaining registry fields.
    mapBehaviorFields<{ speed: number }>(() => 1);
  });

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
    expect(BEHAVIOR_FIELDS.overlaySeekBar.category).toBe('overlay');
    expect(BEHAVIOR_FIELDS.overlayVolumeBar.category).toBe('overlay');
    expect(BEHAVIOR_FIELDS.overlayVolumeBar.default).toBe(false);
    expect(BEHAVIOR_FIELDS.overlayExtrasBar.category).toBe('overlay');
    expect(BEHAVIOR_FIELDS.overlayExtrasBar.default).toBe(false);
    expect(new Set(Object.values(BEHAVIOR_FIELDS).map((field) => field.category))).toEqual(
      new Set(['playback', 'overlay', 'hotkeys']),
    );
  });
});
