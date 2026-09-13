// SPDX-License-Identifier: GPL-3.0-only

import { getOriginIdentity, hostPatternsCover, type HostPattern } from '../access/site-access';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type GrantedTab = {
  id?: number;
  url?: string;
};

export type GrantedTabQuery = {
  query: (queryInfo: chrome.tabs.QueryInfo) => Promise<GrantedTab[]>;
};

export async function ensureEnginesOnGrantedTabs(
  allowedHostPatterns: HostPattern[],
  deps: {
    tabs?: GrantedTabQuery;
    ensure?: typeof ensureCurrentTabEngine;
    scripting?: ScriptInjector;
  } = {},
): Promise<void> {
  if (allowedHostPatterns.length === 0) {
    return;
  }
  const tabs = deps.tabs ?? chrome.tabs;
  const ensure = deps.ensure ?? ensureCurrentTabEngine;
  const listed = await tabs.query({});
  await Promise.all(
    listed.map(async (tab) => {
      if (tab.id == null || !tab.url) {
        return;
      }
      const identity = getOriginIdentity(tab.url);
      if (!identity || !hostPatternsCover(identity, allowedHostPatterns)) {
        return;
      }
      try {
        await ensure(tab.id, deps.scripting);
      } catch {
        // Best-effort. Enable or a later speed action retries the tab.
      }
    }),
  );
}
