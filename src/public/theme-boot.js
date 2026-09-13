// SPDX-License-Identifier: GPL-3.0-only

(() => {
  const KEY = 'osvsc:theme-preference';
  let preference;
  try {
    preference = localStorage.getItem(KEY);
  } catch {
    preference = null;
  }
  if (preference !== 'dark' && preference !== 'light' && preference !== 'system') {
    preference = 'system';
  }
  let systemDark = false;
  try {
    systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // Keep light when matchMedia is unavailable.
  }
  const scheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(scheme);
  root.style.colorScheme = scheme;
})();
