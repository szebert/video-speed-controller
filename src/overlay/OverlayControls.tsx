// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { Grid3x3Icon, SettingsIcon } from 'lucide-react';
import { Button, type PressEvent } from 'react-aria-components';
import { speedPolicyFromApplied } from '../core/applied-tab-behavior';
import { canAdjustSpeed, formatSpeed } from '../core/speed';
import { t, type MessageKey } from '../i18n/t';
import { overlayPositionToGrid, type OverlayPosition } from '../settings/site-behavior';
import './enable-shadow-dom';
import type { OverlayControlsProps } from './types';

const POSITION_LABELS = [
  'positionTopLeft',
  'positionTopCenter',
  'positionTopRight',
  'positionCenterLeft',
  'positionCenter',
  'positionCenterRight',
  'positionBottomLeft',
  'positionBottomCenter',
  'positionBottomRight',
] as const satisfies readonly MessageKey[];

export function OverlayControls({
  behavior,
  policy,
  visible = true,
  onAdjust,
  onSetPosition,
  onOpenSettings,
  onInteractiveChange,
}: OverlayControlsProps) {
  const resolvedPolicy = policy ?? speedPolicyFromApplied(behavior);
  const canSlow = canAdjustSpeed(behavior.targetSpeed, -1, resolvedPolicy);
  const canFast = canAdjustSpeed(behavior.targetSpeed, 1, resolvedPolicy);
  const [pointerWithin, setPointerWithin] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!visible && (pointerWithin || focusWithin || pickerOpen)) {
    setPointerWithin(false);
    setFocusWithin(false);
    setPickerOpen(false);
  } else if (visible && !behavior.overlayPositionButton && pickerOpen) {
    setPickerOpen(false);
  }
  const lastInteractive = useRef<boolean | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const pickerAllowed = visible && behavior.overlayPositionButton;
  const interactive =
    visible && (pickerOpen || focusWithin || (pointerWithin && behavior.overlayHoverHold));

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    if (visible && shell.matches(':hover')) {
      setPointerWithin(true);
    }
    const onEnter = () => {
      setPointerWithin(true);
    };
    const onLeave = () => {
      setPointerWithin(false);
    };
    shell.addEventListener('pointerenter', onEnter);
    shell.addEventListener('pointerleave', onLeave);
    return () => {
      shell.removeEventListener('pointerenter', onEnter);
      shell.removeEventListener('pointerleave', onLeave);
    };
  }, [visible]);

  useEffect(() => {
    if (lastInteractive.current === interactive) {
      return;
    }
    lastInteractive.current = interactive;
    onInteractiveChange(interactive);
  }, [interactive, onInteractiveChange]);

  const showPicker = pickerAllowed && pickerOpen;
  const pickerPlacement =
    overlayPositionToGrid(behavior.overlayPosition).row === 2 ? 'above' : 'below';

  function onShellBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setFocusWithin(false);
  }

  return (
    <div
      ref={shellRef}
      className="controls-shell"
      onFocus={() => {
        setFocusWithin(true);
      }}
      onBlur={onShellBlur}
    >
      <div className="controls" role="group">
        {behavior.overlayPositionButton ? (
          <Button
            className="control control-icon"
            aria-label={t('overlayMove')}
            aria-expanded={showPicker}
            aria-haspopup="true"
            onPress={(event) => {
              setPickerOpen((open) => !open);
              blurAfterPointerPress(event);
            }}
          >
            <Grid3x3Icon />
          </Button>
        ) : null}
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
        <div className="speed">{formatSpeed(behavior.targetSpeed)}</div>
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
        {behavior.overlaySettingsButton ? (
          <Button
            className="control control-icon"
            aria-label={t('openSettings')}
            onPress={() => {
              setPickerOpen(false);
              onOpenSettings();
            }}
          >
            <SettingsIcon />
          </Button>
        ) : null}
      </div>
      {showPicker ? (
        <div
          className="position-picker"
          data-placement={pickerPlacement}
          role="group"
          aria-label={t('overlayPosition')}
        >
          {POSITION_LABELS.map((labelKey, index) => {
            const position = index as OverlayPosition;
            const selected = behavior.overlayPosition === position;
            return (
              <Button
                key={labelKey}
                className="position-cell"
                aria-label={t(labelKey)}
                aria-pressed={selected}
                onPress={(event) => {
                  setPickerOpen(false);
                  onSetPosition(position);
                  blurAfterPointerPress(event);
                }}
              >
                <span
                  className={selected ? 'position-dot position-dot-selected' : 'position-dot'}
                />
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function blurAfterPointerPress(event: PressEvent): void {
  if (event.pointerType === 'keyboard' || !(event.target instanceof HTMLElement)) {
    return;
  }
  event.target.blur();
}
