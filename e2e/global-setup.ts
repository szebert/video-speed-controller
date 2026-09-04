// SPDX-License-Identifier: GPL-3.0-only

import { buildE2eExtension } from './extension-build';

export default function globalSetup(): void {
  buildE2eExtension();
}
