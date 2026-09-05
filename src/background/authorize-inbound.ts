// SPDX-License-Identifier: GPL-3.0-only

import { isExtensionPageSender } from './extension-page-sender';

export type InboundAuthorization = 'allow' | 'unauthorized' | 'ignore';

export function authorizeBackgroundInbound(
  channel: 'popup' | 'options' | 'content' | null,
  type: string,
  sender: chrome.runtime.MessageSender,
): InboundAuthorization {
  if (channel === 'popup' || channel === 'options') {
    if (isExtensionPageSender(sender)) {
      return 'allow';
    }
    return type === 'GET_POPUP_STATE' ? 'ignore' : 'unauthorized';
  }
  if (channel === 'content') {
    return sender.tab?.id != null ? 'allow' : 'ignore';
  }
  return 'ignore';
}
