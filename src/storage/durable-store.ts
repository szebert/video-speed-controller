// SPDX-License-Identifier: GPL-3.0-only

export type DurableSettingsStore = {
  get: (
    keys?: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  getBytesInUse: (keys?: string | string[] | null) => Promise<number>;
};

type ChromeDurableArea = Pick<
  chrome.storage.StorageArea,
  'get' | 'set' | 'remove' | 'getBytesInUse'
>;

export function chromeDurableStore(area: ChromeDurableArea): DurableSettingsStore {
  return {
    get: (keys) => area.get(keys ?? null),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
    getBytesInUse: (keys) => area.getBytesInUse(keys ?? null),
  };
}

export function defaultSyncStore(): DurableSettingsStore {
  return chromeDurableStore(chrome.storage.sync);
}

export function defaultLocalStore(): DurableSettingsStore {
  return chromeDurableStore(chrome.storage.local);
}

export function estimateRecordBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

export function estimateStorageEntryBytes(key: string, value: unknown): number {
  return new TextEncoder().encode(key).length + estimateRecordBytes(value);
}
