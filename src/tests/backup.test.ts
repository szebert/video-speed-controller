// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_INVALID,
  BACKUP_TOO_LARGE,
  BACKUP_TOO_MANY_SITES,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_SITES,
  fitLogicalBackup,
  migrateBackup,
  parseBackupText,
  projectBackup,
  rankBackupSitesNewestFirst,
  serializeBackup,
  utf8BackupByteLength,
} from '../settings/backup';
import { SPEED_MAX_SETTING_MAX } from '../core/speed';

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

  it('ranks newer lastUsedAt first and uses hostname as a tie-break', () => {
    expect(
      rankBackupSitesNewestFirst([
        { hostname: 'z.example', lastUsedAt: 10 },
        { hostname: 'a.example', lastUsedAt: 10 },
        { hostname: 'm.example', lastUsedAt: 50 },
      ]).map((site) => site.hostname),
    ).toEqual(['m.example', 'a.example', 'z.example']);
  });

  it('keeps the newest sites when fitting to site and byte limits', () => {
    const ranked = ['new.example', 'mid.example', 'old.example'];
    const backup = projectBackup({
      global: {},
      sites: {
        'old.example': { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
        'mid.example': { speed: { kind: 'value', value: 1.5, updatedAt: 2 } },
        'new.example': { speed: { kind: 'value', value: 1.75, updatedAt: 3 } },
      },
      theme: 'dark',
    });
    expect(fitLogicalBackup(backup, ranked, { maxSites: 2 }).sites).toEqual({
      'mid.example': { speed: 1.5 },
      'new.example': { speed: 1.75 },
    });
    expect(fitLogicalBackup(backup, ['new.example'], { maxSites: 2 }).sites).toEqual({
      'mid.example': { speed: 1.5 },
      'new.example': { speed: 1.75 },
    });
    const threeBytes = utf8BackupByteLength(serializeBackup(backup));
    const twoBytes = utf8BackupByteLength(
      serializeBackup(fitLogicalBackup(backup, ranked, { maxSites: 2 })),
    );
    expect(threeBytes).toBeGreaterThan(twoBytes);
    const twoNewest = fitLogicalBackup(backup, ranked, {
      maxSites: 3,
      maxBytes: twoBytes + Math.floor((threeBytes - twoBytes) / 2),
    });
    expect(Object.keys(twoNewest.sites).sort()).toEqual(['mid.example', 'new.example']);
    expect(utf8BackupByteLength(serializeBackup(twoNewest))).toBeLessThanOrEqual(twoBytes);
    expect(() => fitLogicalBackup(backup, ranked, { maxBytes: 1 })).toThrow(BACKUP_TOO_LARGE);
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
