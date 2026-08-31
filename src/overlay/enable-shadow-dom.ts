// SPDX-License-Identifier: GPL-3.0-only

import { enableShadowDOM } from 'react-stately/private/flags/flags';

// RAC document-level press listeners retarget to the shadow host unless this is on.
enableShadowDOM();
