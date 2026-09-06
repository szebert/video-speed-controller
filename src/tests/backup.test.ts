// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertCompleteBackup,
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_INVALID,
  BACKUP_TOO_LARGE,
  BACKUP_TOO_MANY_SITES,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_SITES,
  migrateBackup,
  parseBackupText,
  projectBackup,
  serializeBackup,
  type LogicalBackup,
} from '../settings/backup';
import { SPEED_MAX_SETTING_MAX } from '../core/speed';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function readBackupFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

const COMPLETE_BACKUP_V1: LogicalBackup = {
  formatVersion: 1,
  global: {
    speed: 1.25,
    speedMin: 0.25,
    speedMax: 4,
    speedTick: 0.25,
    overlayVisible: true,
    overlayPosition: 2,
    overlayPositionButton: false,
    overlaySettingsButton: true,
    overlayAutoHide: true,
    overlayHoverHold: false,
    overlayAutoHideDelayMs: 1500,
  },
  sites: {
    'netflix.com': {
      speed: 1.5,
      overlayVisible: false,
    },
    'www.youtube.com': {
      speed: 2,
    },
  },
  theme: 'light',
};

describe('backup format', () => {
  it('projects value overrides only and always includes theme', () => {
    const backup = projectBackup({
      global: {
        speed: { kind: 'value', value: 1.25, updatedAt: 10 },
        overlayVisible: { kind: 'inherit', updatedAt: 11 },
      },
      sites: {
        'netflix.com': {
          speed: { kind: 'value', value: 1.5, updatedAt: 12 },
        },
        'youtube.com': {
          speed: { kind: 'inherit', updatedAt: 9 },
        },
        'zzz.example': {},
      },
      theme: 'dark',
    });
    expect(backup).toEqual({
      formatVersion: 1,
      global: { speed: 1.25 },
      sites: {
        'netflix.com': { speed: 1.5 },
      },
      theme: 'dark',
    });
    expect(JSON.stringify(backup)).not.toContain('updatedAt');
    expect(JSON.stringify(backup)).not.toContain('lastUsedAt');
    expect(JSON.stringify(backup)).not.toContain('generation');
  });

  it('serializes sites in plain lexical order', () => {
    const text = serializeBackup({
      formatVersion: 1,
      global: { overlayVisible: true, speed: 1.25 },
      sites: {
        'youtube.com': { speed: 2 },
        'netflix.com': { speed: 1.5 },
      },
      theme: 'light',
    });
    expect(text.indexOf('netflix.com')).toBeLessThan(text.indexOf('youtube.com'));
    expect(text.indexOf('"speed": 1.25')).toBeLessThan(text.indexOf('"overlayVisible": true'));
    expect(text.endsWith('\n')).toBe(true);
  });

  it('accepts empty global and optional theme', () => {
    expect(
      parseBackupText(
        JSON.stringify({
          formatVersion: 1,
          global: {},
          sites: {},
        }),
      ),
    ).toEqual({
      status: 'ready',
      backup: { formatVersion: 1, global: {}, sites: {} },
    });
  });

  it('clamps in-range domain values and omits empty sites', () => {
    const parsed = parseBackupText(
      JSON.stringify({
        formatVersion: 1,
        global: { speed: 100 },
        sites: {
          'youtube.com': {},
          'netflix.com': { speed: 1.5 },
        },
        theme: 'system',
      }),
    );
    expect(parsed.status).toBe('ready');
    if (parsed.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(parsed.backup.global.speed).toBe(SPEED_MAX_SETTING_MAX);
    expect(parsed.backup.sites).toEqual({ 'netflix.com': { speed: 1.5 } });
  });

  it('rejects raw storage dumps, unknown keys, and newer format versions', () => {
    expect(parseBackupText(JSON.stringify({ schemaVersion: 1, overrides: {} }))).toEqual({
      status: 'invalid',
      error: BACKUP_INVALID,
    });
    expect(
      parseBackupText(
        JSON.stringify({
          formatVersion: 1,
          global: { speed: 1.25, mystery: true },
        }),
      ),
    ).toEqual({ status: 'invalid', error: BACKUP_INVALID });
    expect(migrateBackup({ formatVersion: 2, global: {} })).toEqual({
      status: 'unsupported',
      formatVersion: 2,
    });
    expect(BACKUP_CREATED_BY_NEWER_VERSION).toMatch(/newer version/i);
  });

  it('names both source hostnames on a normalize collision', () => {
    expect(
      parseBackupText(
        JSON.stringify({
          formatVersion: 1,
          sites: {
            'YouTube.com': { speed: 2 },
            'youtube.com': { speed: 1.5 },
          },
        }),
      ),
    ).toEqual({
      status: 'invalid',
      error: 'Duplicate site hostname: "YouTube.com" and "youtube.com"',
    });
  });

  it('rejects invalid hostnames', () => {
    expect(
      parseBackupText(
        JSON.stringify({
          formatVersion: 1,
          sites: { 'example.com/path': { speed: 2 } },
        }),
      ),
    ).toEqual({
      status: 'invalid',
      error: 'Invalid hostname: "example.com/path"',
    });
  });

  it('rejects more than 10_000 site keys including empty objects', () => {
    const sites: Record<string, Record<string, never>> = {};
    for (let index = 0; index <= MAX_BACKUP_SITES; index += 1) {
      sites[`site${String(index).padStart(5, '0')}.example`] = {};
    }
    expect(parseBackupText(JSON.stringify({ formatVersion: 1, sites }))).toEqual({
      status: 'invalid',
      error: BACKUP_TOO_MANY_SITES,
    });
  });

  it('parses and reserializes the frozen V1 complete fixture', () => {
    const text = readBackupFixture('backup-v1-complete.json');
    expect(parseBackupText(text)).toEqual({ status: 'ready', backup: COMPLETE_BACKUP_V1 });
    expect(serializeBackup(COMPLETE_BACKUP_V1)).toBe(text);
  });

  it('parses and reserializes the frozen V1 minimal fixture', () => {
    const text = readBackupFixture('backup-v1-minimal.json');
    const backup: LogicalBackup = { formatVersion: 1, global: {}, sites: {} };
    expect(parseBackupText(text)).toEqual({ status: 'ready', backup });
    expect(serializeBackup(backup)).toBe(text);
  });

  it('leaves a V2 fixture unsupported until a V1→V2 migration exists', () => {
    expect(parseBackupText(readBackupFixture('backup-v2-unsupported.json'))).toEqual({
      status: 'unsupported',
      formatVersion: 2,
    });
  });

  it('fails a complete export that exceeds site or byte limits', () => {
    const backup = projectBackup({
      global: {},
      sites: {
        'old.example': { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
        'mid.example': { speed: { kind: 'value', value: 1.5, updatedAt: 2 } },
        'new.example': { speed: { kind: 'value', value: 1.75, updatedAt: 3 } },
      },
      theme: 'dark',
    });
    expect(() => assertCompleteBackup(backup)).not.toThrow();
    expect(() => assertCompleteBackup(backup, { maxSites: 2 })).toThrow(BACKUP_TOO_MANY_SITES);
    expect(() => assertCompleteBackup(backup, { maxBytes: 1 })).toThrow(BACKUP_TOO_LARGE);
  });

  it('measures the 4 MiB cap in UTF-8 bytes, not JS string length', () => {
    const prefix = '{"formatVersion":1,"note":"';
    const suffix = '"}';
    const remain = MAX_BACKUP_BYTES - prefix.length - suffix.length;
    const ascii = `${prefix}${'a'.repeat(remain + 1)}${suffix}`;
    expect(ascii.length).toBeGreaterThan(MAX_BACKUP_BYTES);
    expect(parseBackupText(ascii)).toEqual({ status: 'invalid', error: BACKUP_TOO_LARGE });

    const oversizeUtf8 = `${prefix}${'é'.repeat(Math.ceil(remain / 2) + 1)}${suffix}`;
    expect(new TextEncoder().encode(oversizeUtf8).byteLength).toBeGreaterThan(MAX_BACKUP_BYTES);
    expect(oversizeUtf8.length).toBeLessThanOrEqual(MAX_BACKUP_BYTES);
    expect(parseBackupText(oversizeUtf8)).toEqual({ status: 'invalid', error: BACKUP_TOO_LARGE });
  });
});
