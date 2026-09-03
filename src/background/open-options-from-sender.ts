// SPDX-License-Identifier: GPL-3.0-only

import { openExtensionOptionsPage } from '../settings/options-page';
import { getSiteKey } from '../storage/site-key';
import { resolveSenderTabUrl } from './adjust-tab-speed';

export type OpenOptionsFromSenderDeps = {
  readTab?: (tabId: number) => Promise<Pick<chrome.tabs.Tab, 'url'>>;
  openPage?: typeof openExtensionOptionsPage;
};

export async function openOptionsFromSender(
  sender: chrome.runtime.MessageSender,
  deps: OpenOptionsFromSenderDeps = {},
): Promise<{ ok: true }> {
  const resolved = await resolveSenderTabUrl(
    sender,
    deps.readTab ?? ((tabId) => chrome.tabs.get(tabId)),
  );
  const key = resolved ? getSiteKey(resolved.url) : { supported: false as const };
  const openPage = deps.openPage ?? openExtensionOptionsPage;
  openPage(key.supported ? key.hostname : null);
  return { ok: true };
}
