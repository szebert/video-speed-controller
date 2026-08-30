// SPDX-License-Identifier: GPL-3.0-only

import { estimateRecordBytes, type DurableSettingsStore } from '../storage/durable-store';

export function memoryDurable(
  initial: Record<string, unknown> = {},
): DurableSettingsStore & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      if (keys == null) {
        return { ...data };
      }
      if (typeof keys === 'string') {
        return { [keys]: data[keys] };
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, data[key]]));
      }
      return Object.fromEntries(Object.keys(keys).map((key) => [key, data[key]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        delete data[key];
      }
    },
    async getBytesInUse(keys) {
      const selected =
        keys == null
          ? data
          : typeof keys === 'string'
            ? { [keys]: data[keys] }
            : Object.fromEntries(keys.map((key) => [key, data[key]]));
      return estimateRecordBytes(selected);
    },
  };
}
