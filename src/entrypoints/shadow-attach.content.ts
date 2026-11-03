// SPDX-License-Identifier: GPL-3.0-only

import { installAttachShadowHook } from '../core/shadow-attach';

export default defineContentScript({
  registration: 'runtime',
  // WXT HMR calls matches.map; keep empty so optional host permissions stay optional.
  matches: [],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installAttachShadowHook();
  },
});
