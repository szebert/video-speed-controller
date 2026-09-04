// SPDX-License-Identifier: GPL-3.0-only

import { I18nProvider } from 'react-aria-components';
import { resolveLocale } from '../i18n/locale';
import { OverlayControls } from './OverlayControls';
import type { OverlayControlsProps } from './types';

export function OverlayRoot(props: OverlayControlsProps) {
  return (
    <I18nProvider locale={resolveLocale()}>
      <OverlayControls
        key={props.visible && props.behavior.overlayPositionButton ? 'held' : 'reset'}
        {...props}
      />
    </I18nProvider>
  );
}
