// SPDX-License-Identifier: GPL-3.0-only

import { t } from '@/i18n/t';
import {
  BACKUP_CONTAINS_NEWER_SETTINGS,
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_INVALID,
  BACKUP_TOO_LARGE,
  BACKUP_TOO_MANY_SITES,
  MAX_BACKUP_BYTES,
  parseBackupText,
} from '../../settings/backup';

export type StagedBackupFile =
  | {
      status: 'ready';
      fileName: string;
      byteLength: number;
      backupText: string;
    }
  | {
      status: 'error';
      fileName: string;
      byteLength: number;
      error: string;
    };

export function backupFailureMessage(error: string | undefined): string {
  if (error === BACKUP_CREATED_BY_NEWER_VERSION) {
    return t('backupNewerVersion');
  }
  if (error === BACKUP_CONTAINS_NEWER_SETTINGS) {
    return t('backupNewerSettings');
  }
  if (error === BACKUP_TOO_LARGE) {
    return t('backupTooLarge');
  }
  if (error === BACKUP_TOO_MANY_SITES) {
    return t('backupTooManySites');
  }
  if (error === BACKUP_INVALID) {
    return t('backupInvalid');
  }
  return error || t('backupInvalid');
}

export function backupExportFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `os-vsc-backup-${stamp}.json`;
}

export function formatBackupFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes >= 10 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseStagedBackupFile(
  fileName: string,
  byteLength: number,
  text: string,
): StagedBackupFile {
  const parsed = parseBackupText(text);
  if (parsed.status === 'ready') {
    return { status: 'ready', fileName, byteLength, backupText: text };
  }
  if (parsed.status === 'unsupported') {
    return {
      status: 'error',
      fileName,
      byteLength,
      error: t('backupNewerVersion'),
    };
  }
  return {
    status: 'error',
    fileName,
    byteLength,
    error: backupFailureMessage(parsed.error),
  };
}

export async function readAndParseBackupFile(file: File): Promise<StagedBackupFile> {
  const fileName = file.name.trim() || 'os-vsc-backup.json';
  if (file.size > MAX_BACKUP_BYTES) {
    return {
      status: 'error',
      fileName,
      byteLength: file.size,
      error: t('backupTooLarge'),
    };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      status: 'error',
      fileName,
      byteLength: file.size,
      error: t('backupInvalid'),
    };
  }
  return parseStagedBackupFile(fileName, file.size, text);
}
