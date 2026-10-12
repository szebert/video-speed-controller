// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import catalog from '../../e2e/fixtures/sites/catalog.json';

// Test-layer schema: this catalog is never loaded by the content runtime.
const siteSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    hosts: z.array(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)).min(1),
    auth: z.enum(['none', 'free-account', 'subscription']),
    geo: z.enum(['unrestricted', 'restricted']),
    stability: z.enum(['stable', 'brittle']),
    policy: z.enum(['generic', 'builtin']),
    checks: z.strictObject({
      fixtureIdentified: z.boolean(),
      externalSmoke: z.boolean(),
      genericEvaluated: z.boolean(),
      builtinPolicyRequired: z.boolean(),
    }),
    notes: z.string().min(1),
  })
  .refine((site) => site.policy !== 'builtin' || site.checks.builtinPolicyRequired, {
    message: 'An active built-in policy requires a verified compatibility need',
    path: ['checks', 'builtinPolicyRequired'],
  });

const sample = {
  id: 'example',
  name: 'Example',
  hosts: ['example.com'],
  auth: 'none',
  geo: 'unrestricted',
  stability: 'stable',
  policy: 'generic',
  checks: {
    fixtureIdentified: false,
    externalSmoke: false,
    genericEvaluated: false,
    builtinPolicyRequired: false,
  },
  notes: 'Synthetic fixture.',
};

describe('compatibility catalog', () => {
  it('validates every entry and keeps identifiers and hosts unique', () => {
    const sites = z.array(siteSchema).min(1).parse(catalog);
    expect(new Set(sites.map((site) => site.id)).size).toBe(sites.length);
    const hosts = sites.flatMap((site) => site.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it.each([
    ['generic', false, true],
    ['generic', true, true],
    ['builtin', true, true],
    ['builtin', false, false],
  ] as const)('validates policy=%s with required=%s', (policy, required, valid) => {
    expect(
      siteSchema.safeParse({
        ...sample,
        policy,
        checks: { ...sample.checks, builtinPolicyRequired: required },
      }).success,
    ).toBe(valid);
  });

  it('accepts completed checks and a verified need pending implementation', () => {
    expect(
      siteSchema.safeParse({
        ...sample,
        checks: {
          fixtureIdentified: true,
          externalSmoke: true,
          genericEvaluated: true,
          builtinPolicyRequired: true,
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    { auth: 'guest' },
    { geo: 'worldwide' },
    { stability: 'unknown' },
    { policy: 'handler' },
    { hosts: [] },
    { hosts: ['https://example.com'] },
    { checks: { ...sample.checks, builtinPolicyRequired: 'false' } },
    { checks: { fixtureIdentified: false } },
    { script: 'custom.js' },
  ])('rejects malformed catalog metadata: %j', (fields) => {
    expect(siteSchema.safeParse({ ...sample, ...fields }).success).toBe(false);
  });
});
