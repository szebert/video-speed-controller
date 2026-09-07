// SPDX-License-Identifier: GPL-3.0-only

import { contentFailureMessage, sendContentRequest } from '../protocol/content/client';
import { isTabSpeedAction, type ControllerAction } from './controller-action';

export async function executeControllerAction(action: ControllerAction): Promise<void> {
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
  } catch (error) {
    console.warn('DISPATCH_TAB_ACTION failed', error);
  }
}
