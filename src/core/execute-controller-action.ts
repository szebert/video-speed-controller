// SPDX-License-Identifier: GPL-3.0-only

import { contentFailureMessage, sendContentRequest } from '../protocol/content/client';
import type { HotkeyBinding } from '../settings/hotkey-binding';
import { isTabSpeedAction, type ControllerAction } from './controller-action';
import type { MediaRegistry } from './media-registry';

export type ControllerActionContext = {
  resolveRegistry: () => MediaRegistry;
  source: { kind: 'hotkey'; binding: HotkeyBinding } | { kind: 'overlay'; video: HTMLVideoElement };
};

export async function executeControllerAction(
  action: ControllerAction,
  context: ControllerActionContext,
): Promise<void> {
  if (!isTabSpeedAction(action)) {
    return;
  }
  try {
    const response = await sendContentRequest({ type: 'DISPATCH_TAB_ACTION', action });
    if (!response) {
      console.warn('DISPATCH_TAB_ACTION failed', 'Invalid response');
      return;
    }
    const failure = contentFailureMessage(response);
    if (failure) {
      console.warn('DISPATCH_TAB_ACTION failed', failure);
    }
    if (!response.ok || context.source.kind !== 'hotkey') {
      return;
    }
    // Resolve after DISPATCH. setSpeed re-injects the content script, which
    // invalidates the engine that started this call.
    context.resolveRegistry().flashHotkeyAction({
      previousTargetSpeed: response.previousTargetSpeed,
      targetSpeed: response.targetSpeed,
      binding: context.source.binding,
    });
  } catch (error) {
    console.warn('DISPATCH_TAB_ACTION failed', error);
  }
}
