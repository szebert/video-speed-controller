// SPDX-License-Identifier: GPL-3.0-only

// Node 25+ defines global Web Storage that stays undefined unless
// --localstorage-file is set. Vitest does not replace an existing global, so
// tests keep that placeholder instead of jsdom's storage.
const view = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (view) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (!view[key]) continue;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      get: () => view[key],
    });
  }
}
