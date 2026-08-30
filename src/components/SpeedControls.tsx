// SPDX-License-Identifier: GPL-3.0-only

import { i18n } from '#i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Slider } from '@/components/ui/slider';
import { DEFAULT_SPEED_POLICY, formatSpeed, snapSliderSpeed, type SpeedPolicy } from '@/core/speed';

type SpeedControlsProps = {
  displaySpeed: number;
  disabled: boolean;
  showOffBadge?: boolean;
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
  disabled,
  showOffBadge = false,
  policy = DEFAULT_SPEED_POLICY,
  onAdjust,
  onReset,
  onPreviewSlider,
  onCommitSlider,
}: SpeedControlsProps) {
  const readout = formatSpeed(displaySpeed);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{i18n.t('siteSpeed')}</h2>
        {showOffBadge ? <Badge variant="secondary">{i18n.t('disabled')}</Badge> : null}
      </div>
      <div className="text-center text-3xl font-semibold tabular-nums" aria-live="polite">
        {readout}
      </div>
      <ButtonGroup className="w-full [&>[data-slot=button]]:flex-1">
        <Button
          variant="outline"
          isDisabled={disabled}
          onPress={() => onAdjust(-1)}
          aria-label={i18n.t('slower')}
        >
          −
        </Button>
        <Button variant="outline" isDisabled={disabled} onPress={onReset}>
          {i18n.t('reset')}
        </Button>
        <Button
          variant="outline"
          isDisabled={disabled}
          onPress={() => onAdjust(1)}
          aria-label={i18n.t('faster')}
        >
          +
        </Button>
      </ButtonGroup>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatSpeed(policy.min)}</span>
        <Slider
          aria-label={i18n.t('siteSpeed')}
          isDisabled={disabled}
          minValue={policy.min}
          maxValue={policy.max}
          step={policy.sliderStep}
          value={snapSliderSpeed(displaySpeed, policy)}
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
