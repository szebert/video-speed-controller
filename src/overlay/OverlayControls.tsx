// SPDX-License-Identifier: GPL-3.0-only

import { useLayoutEffect, useRef } from 'react';
import { Button } from 'react-aria-components';
import { canAdjustSpeed, DEFAULT_SPEED_POLICY, formatSpeed } from '../core/speed';
import { t } from '../i18n/t';
import type { OverlayControlsProps } from './types';

export function OverlayControls({
  behavior,
  policy = DEFAULT_SPEED_POLICY,
  onAdjust,
  onPointerActiveChange,
  onFocusWithinChange,
}: OverlayControlsProps) {
  const canSlow = canAdjustSpeed(behavior.targetSpeed, -1, policy);
  const canFast = canAdjustSpeed(behavior.targetSpeed, 1, policy);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = controlsRef.current;
    if (!node) {
      return;
    }
    const onEnter = () => {
      onPointerActiveChange(true);
    };
    const onLeave = () => {
      onPointerActiveChange(false);
    };
    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);
    return () => {
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
    };
  }, [onPointerActiveChange]);

  return (
    <div
      ref={controlsRef}
      className="controls"
      role="group"
      onFocus={() => {
        onFocusWithinChange(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onFocusWithinChange(false);
        }
      }}
    >
      <Button
        className="control"
        aria-label={t('slower')}
        isDisabled={!canSlow}
        onPress={() => {
          if (canSlow) {
            onAdjust(-1);
          }
        }}
      >
        −
      </Button>
      <div className="speed" aria-live="polite">
        {formatSpeed(behavior.targetSpeed)}
      </div>
      <Button
        className="control"
        aria-label={t('faster')}
        isDisabled={!canFast}
        onPress={() => {
          if (canFast) {
            onAdjust(1);
          }
        }}
      >
        +
      </Button>
    </div>
  );
}
