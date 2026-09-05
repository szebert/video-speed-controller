// SPDX-License-Identifier: GPL-3.0-only

export type ControlMetadataParse<T> =
  | { status: 'absent' }
  | { status: 'valid'; value: T }
  | { status: 'corrupt' }
  | { status: 'unsupported' };

export function parseSchemaVersionedControl<T>(
  raw: unknown,
  parseV1: (record: Record<string, unknown>) => T | null,
): ControlMetadataParse<T> {
  if (raw === undefined) {
    return { status: 'absent' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'corrupt' };
  }
  const record = raw as Record<string, unknown>;
  const version = record.schemaVersion;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > 1) {
    return { status: 'unsupported' };
  }
  if (version !== 1) {
    return { status: 'corrupt' };
  }
  const value = parseV1(record);
  if (!value) {
    return { status: 'corrupt' };
  }
  return { status: 'valid', value };
}

export function isKnownControlReplica<T>(
  parsed: ControlMetadataParse<T>,
): parsed is { status: 'absent' } | { status: 'valid'; value: T } {
  return parsed.status === 'absent' || parsed.status === 'valid';
}
