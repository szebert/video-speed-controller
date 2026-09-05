// SPDX-License-Identifier: GPL-3.0-only

import { DEFAULT_SPEED_POLICY } from '../core/speed';

export type ReapplyMode = 'none' | 'preserve-target' | 'revalidate-target' | 'resolve-target';

// Content-safe registry: defaults and reapply policy. Domain types derive from
// this. Validators do not — Mini APPLY, options RPC, and storage salvage each
// keep their own schema so Zod stays out of overlay/content.
export const BEHAVIOR_FIELDS = {
  speed: {
    default: 1,
    category: 'playback',
    reapply: { global: 'none', site: 'resolve-target' },
  },
  speedMin: {
    default: DEFAULT_SPEED_POLICY.min,
    category: 'playback',
    reapply: { global: 'revalidate-target', site: 'revalidate-target' },
  },
  speedMax: {
    default: DEFAULT_SPEED_POLICY.max,
    category: 'playback',
    reapply: { global: 'revalidate-target', site: 'revalidate-target' },
  },
  speedTick: {
    default: DEFAULT_SPEED_POLICY.tick,
    category: 'playback',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlayVisible: {
    default: true,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlayPosition: {
    default: 1,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlayPositionButton: {
    default: true,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlaySettingsButton: {
    default: true,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlayAutoHide: {
    default: true,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlayHoverHold: {
    default: false,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
  overlayAutoHideDelayMs: {
    default: 2000,
    category: 'overlay',
    reapply: { global: 'preserve-target', site: 'preserve-target' },
  },
} as const;

export type BehaviorField = keyof typeof BEHAVIOR_FIELDS;
export type EditableBehaviorField = BehaviorField;

export const EDITABLE_BEHAVIOR_FIELDS = Object.keys(BEHAVIOR_FIELDS) as [
  BehaviorField,
  ...BehaviorField[],
];

export type BooleanBehaviorField = {
  [K in BehaviorField]: (typeof BEHAVIOR_FIELDS)[K]['default'] extends boolean ? K : never;
}[BehaviorField];

export type NumberBehaviorField = {
  [K in BehaviorField]: (typeof BEHAVIOR_FIELDS)[K]['default'] extends number
    ? K extends 'overlayPosition'
      ? never
      : K
    : never;
}[BehaviorField];

export const BOOLEAN_BEHAVIOR_FIELDS = EDITABLE_BEHAVIOR_FIELDS.filter(
  (field): field is BooleanBehaviorField => typeof BEHAVIOR_FIELDS[field].default === 'boolean',
) as [BooleanBehaviorField, ...BooleanBehaviorField[]];

export const NUMBER_BEHAVIOR_FIELDS = EDITABLE_BEHAVIOR_FIELDS.filter(
  (field): field is NumberBehaviorField =>
    field !== 'overlayPosition' && typeof BEHAVIOR_FIELDS[field].default === 'number',
) as [NumberBehaviorField, ...NumberBehaviorField[]];
