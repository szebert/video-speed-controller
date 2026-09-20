// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';

export const CustomSiteSummarySchema = z.object({
  hostname: z.string(),
  lastUsedAt: z.number().finite(),
});

export type CustomSiteSummary = z.infer<typeof CustomSiteSummarySchema>;
