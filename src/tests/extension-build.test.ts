// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { isE2eExtensionManifest } from '../../e2e/extension-build';

describe('isE2eExtensionManifest', () => {
  it('accepts the OSVSC_E2E extension artifact', () => {
    expect(
      isE2eExtensionManifest({
        host_permissions: ['http://127.0.0.1:4173/*'],
        options_ui: { page: 'options.html', open_in_tab: true },
      }),
    ).toBe(true);
  });

  it('rejects a production build without the fixture host permission', () => {
    expect(
      isE2eExtensionManifest({
        options_ui: { page: 'options.html', open_in_tab: true },
      }),
    ).toBe(false);
  });
});
