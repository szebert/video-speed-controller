// SPDX-License-Identifier: GPL-3.0-only

import { Badge } from '@/components/ui/badge';
import { t } from '@/i18n/t';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_SPEED_POLICY,
  formatSpeed,
  sliderBounds,
  sliderValue,
  snapSliderSpeed,
  SPEED_SLIDER_STEP,
  type SpeedPolicy,
} from '@/core/speed';
import { cn } from '@/lib/utils';

type SpeedControlsProps = {
  displaySpeed: number;
  disabled?: boolean;
  pending?: boolean;
  heading?: string;
  resetLabel?: string;
  resetDisabled?: boolean;
  muted?: boolean;
  policy?: SpeedPolicy;
  onAdjust: (direction: 1 | -1) => void;
  onReset: () => void;
  onPreviewSlider?: (speed: number) => void;
  onCommitSlider: (speed: number) => void;
};

function snappedValue(value: number | number[], policy: SpeedPolicy): number {
  return snapSliderSpeed(Array.isArray(value) ? (value[0] ?? policy.min) : value, policy);
}

export function SpeedControls({
  displaySpeed,
  disabled = false,
  pending = false,
  heading,
  resetLabel,
  resetDisabled = false,
  muted = false,
  policy = DEFAULT_SPEED_POLICY,
  onAdjust,
  onReset,
  onPreviewSlider,
  onCommitSlider,
}: SpeedControlsProps) {
  const readout = formatSpeed(displaySpeed);
  const speedLabel = heading ?? t('siteSpeed');
  const bounds = sliderBounds(policy);
  const locked = disabled || pending;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{speedLabel}</h2>
        {disabled ? <Badge variant="secondary">{t('disabled')}</Badge> : null}
      </div>
      <div
        className={cn(
          'text-center text-3xl font-semibold tabular-nums',
          muted && 'text-muted-foreground',
        )}
        aria-live="polite"
      >
        {readout}
      </div>
      <ButtonGroup className="w-full [&>[data-slot=button]]:flex-1">
        <Button
          type="button"
          variant="outline"
          isDisabled={locked}
          onPress={() => onAdjust(-1)}
          aria-label={t('slower')}
        >
          −
        </Button>
        <Button
          type="button"
          variant="outline"
          isDisabled={locked || resetDisabled}
          onPress={onReset}
        >
          {resetLabel ?? t('reset')}
        </Button>
        <Button
          type="button"
          variant="outline"
          isDisabled={locked}
          onPress={() => onAdjust(1)}
          aria-label={t('faster')}
        >
          +
        </Button>
      </ButtonGroup>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatSpeed(policy.min)}</span>
        <Slider
          aria-label={speedLabel}
          isDisabled={locked}
          minValue={bounds.minValue}
          maxValue={bounds.maxValue}
          step={SPEED_SLIDER_STEP}
          value={sliderValue(displaySpeed, policy)}
          onChange={(value) => {
            onPreviewSlider?.(snappedValue(value, policy));
          }}
          onChangeEnd={(value) => {
            onCommitSlider(snappedValue(value, policy));
          }}
        />
        <span>{formatSpeed(policy.max)}</span>
      </div>
    </div>
  );
}
