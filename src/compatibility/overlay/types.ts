// SPDX-License-Identifier: GPL-3.0-only

import type { PlayerStackingMount } from '../../core/player-mount';

/** Site knowledge only. The shared runtime owns placement and lifecycle. */
export type SiteOverlayPolicy = {
  readonly hosts: readonly string[];
  /** Host-wide signals, including routes on which no mount currently applies. */
  readonly navigationEvents: readonly string[];
  /** The dispatcher has already validated HTTP(S) and matched an exact hostname. */
  readonly resolveMount: (video: HTMLVideoElement, pageUrl: URL) => PlayerStackingMount | null;
};
