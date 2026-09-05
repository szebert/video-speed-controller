// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  addPublishSite,
  applyResetAllToOutbox,
  decidePublishSiteReplay,
  decideResetAllReplay,
  emptySiteOutbox,
  parseGlobalReplicaOutbox,
  parseSiteReplicaOutbox,
  usableSiteOutbox,
  REPLICA_OUTBOX_CORRUPT,
  REPLICA_OUTBOX_UNSUPPORTED,
} from '../storage/replica-outbox';

describe('replica outbox parsers', () => {
  it('treats missing metadata as an empty outbox and refuses corrupt or unsupported records', () => {
    expect(parseSiteReplicaOutbox(undefined)).toEqual({ status: 'absent' });
    expect(usableSiteOutbox({ status: 'absent' })).toEqual(emptySiteOutbox());
    expect(parseSiteReplicaOutbox({ schemaVersion: 1, publishSites: 'youtube' })).toEqual({
      status: 'corrupt',
    });
    expect(parseSiteReplicaOutbox({ schemaVersion: 2, publishSites: [] })).toEqual({
      status: 'unsupported',
    });
    expect(() => usableSiteOutbox({ status: 'corrupt' })).toThrow(REPLICA_OUTBOX_CORRUPT);
    expect(() => usableSiteOutbox({ status: 'unsupported' })).toThrow(REPLICA_OUTBOX_UNSUPPORTED);
    expect(parseGlobalReplicaOutbox({ schemaVersion: 1, publish: true })).toEqual({
      status: 'valid',
      value: { schemaVersion: 1, publish: true },
    });
    expect(parseGlobalReplicaOutbox({ schemaVersion: 1 })).toEqual({ status: 'corrupt' });
  });

  it('lets Reset All supersede prior publishSites for reset keys', () => {
    const dirty = addPublishSite(
      addPublishSite(emptySiteOutbox(), 'site:www.youtube.com'),
      'site:keep.example',
    );
    const next = applyResetAllToOutbox(dirty, 3, ['site:www.youtube.com']);
    expect(next).toEqual({
      schemaVersion: 1,
      publishSites: ['site:keep.example'],
      resetAll: { epoch: 3, cleanupPending: true },
    });
  });
});

describe('replica outbox replay decisions', () => {
  it('applies the monotonic three-way rule to pending Reset All', () => {
    expect(decideResetAllReplay({ epoch: 7, cleanupPending: true }, { status: 'known', epoch: 8 })).toBe(
      'superseded',
    );
    expect(decideResetAllReplay({ epoch: 8, cleanupPending: true }, { status: 'known', epoch: 8 })).toBe(
      'active',
    );
    expect(decideResetAllReplay({ epoch: 8, cleanupPending: true }, { status: 'known', epoch: 7 })).toBe(
      'pending',
    );
    expect(decideResetAllReplay({ epoch: 8, cleanupPending: true }, { status: 'unknown' })).toBe(
      'pending',
    );
  });

  it('does not publish a stale, future, or malformed site generation', () => {
    expect(
      decidePublishSiteReplay({ status: 'valid', value: 7 }, { status: 'known', epoch: 8 }, 8),
    ).toEqual({ action: 'obsolete' });
    expect(
      decidePublishSiteReplay({ status: 'valid', value: 7 }, { status: 'known', epoch: 6 }, 6),
    ).toEqual({ action: 'pending' });
    expect(
      decidePublishSiteReplay({ status: 'unknown' }, { status: 'known', epoch: 0 }, 0),
    ).toEqual({ action: 'ineligible' });
    expect(
      decidePublishSiteReplay({ status: 'valid', value: 7 }, { status: 'known', epoch: 7 }, 6),
    ).toEqual({ action: 'eligible', publishGenerationFirst: true });
    expect(
      decidePublishSiteReplay({ status: 'legacy', value: 0 }, { status: 'known', epoch: 0 }, 0),
    ).toEqual({ action: 'eligible', publishGenerationFirst: false });
  });
});
