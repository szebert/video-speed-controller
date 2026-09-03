// SPDX-License-Identifier: GPL-3.0-only

import { useState } from 'react';
import { Grid3x3Icon, SettingsIcon } from 'lucide-react';
import { Button } from 'react-aria-components';
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
}: OverlayControlsProps) {
  const resolvedPolicy = policy ?? speedPolicyFromApplied(behavior);
  const canSlow = canAdjustSpeed(behavior.targetSpeed, -1, resolvedPolicy);
  const canFast = canAdjustSpeed(behavior.targetSpeed, 1, resolvedPolicy);
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!visible && pickerOpen) {
    setPickerOpen(false);
  }
  const showPicker = visible && pickerOpen && behavior.overlayPositionButton;
  const pickerPlacement =
    overlayPositionToGrid(behavior.overlayPosition).row === 2 ? 'above' : 'below';

  return (
    <div className="controls-shell">
      <div className="controls" role="group">
        {behavior.overlayPositionButton ? (
          <Button
            className="control control-icon"
            aria-label={t('overlayMove')}
            aria-expanded={showPicker}
            aria-haspopup="true"
            onPress={() => {
              setPickerOpen((open) => !open);
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
                onPress={() => {
                  setPickerOpen(false);
                  onSetPosition(position);
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
