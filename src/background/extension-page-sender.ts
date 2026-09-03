// SPDX-License-Identifier: GPL-3.0-only

export function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.url) {
    return false;
  }
  try {
    return new URL(sender.url).origin === new URL(chrome.runtime.getURL('/')).origin;
  } catch {
    return false;
  }
}
