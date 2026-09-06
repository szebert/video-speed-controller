// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  backupExportFilename,
  formatBackupFileSize,
  parseStagedBackupFile,
  readAndParseBackupFile,
} from '../entrypoints/options/backup-file';
import { MAX_BACKUP_BYTES } from '../settings/backup';

describe('backup file staging', () => {
  it('accepts a valid backup before merge or replace', () => {
    const backupText = JSON.stringify({ formatVersion: 1 });
    const staged = parseStagedBackupFile('os-vsc-backup.json', backupText.length, backupText);
    expect(staged).toEqual({
      status: 'ready',
      fileName: 'os-vsc-backup.json',
      byteLength: backupText.length,
      backupText,
    });
  });

  it('rejects a malformed file without importing', () => {
    const staged = parseStagedBackupFile('bad.json', 1, '{');
    expect(staged.status).toBe('error');
    if (staged.status !== 'error') {
      throw new Error('expected error');
    }
    expect(staged.error).toBe('This file is not a valid Video Speed Controller backup.');
  });

  it('rejects a newer format version before import', () => {
    const staged = parseStagedBackupFile(
      'future.json',
      20,
      JSON.stringify({ formatVersion: 2, global: {} }),
    );
    expect(staged.status).toBe('error');
    if (staged.status !== 'error') {
      throw new Error('expected error');
    }
    expect(staged.error).toMatch(/newer version/i);
  });

  it('rejects an oversized file without reading it', async () => {
    const file = new File(['x'], 'huge.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_BYTES + 1 });
    const staged = await readAndParseBackupFile(file);
    expect(staged.status).toBe('error');
    if (staged.status !== 'error') {
      throw new Error('expected error');
    }
    expect(staged.error).toBe('This backup file is too large.');
  });

  it('names exported files with a local timestamp', () => {
    expect(backupExportFilename(new Date(2026, 8, 6, 8, 1, 22))).toBe(
      'os-vsc-backup-2026-09-06T08-01-22.json',
    );
  });

  it('formats byte sizes for the staged file', () => {
    expect(formatBackupFileSize(400)).toBe('400 B');
    expect(formatBackupFileSize(1536)).toBe('1.5 KB');
    expect(formatBackupFileSize(12_288)).toBe('12 KB');
    expect(formatBackupFileSize(1_572_864)).toBe('1.5 MB');
  });
});
