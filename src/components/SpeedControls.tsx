// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_SPEED_POLICY,
  formatSpeed,
  snapSliderSpeed,
  type SpeedPolicy,
} from '../core/speed';

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
    <div className={disabled ? 'speed-controls is-disabled' : 'speed-controls'}>
      <div className="speed-readout-wrap">
        <div className="speed-readout" aria-live="polite">
          {readout}
        </div>
        {showOffBadge ? <span className="speed-badge">Disabled</span> : null}
      </div>
      <div className="speed-buttons">
        <button type="button" disabled={disabled} onClick={() => onAdjust(-1)} aria-label="Slower">
          −
        </button>
        <button type="button" disabled={disabled} onClick={onReset}>
          Reset
        </button>
        <button type="button" disabled={disabled} onClick={() => onAdjust(1)} aria-label="Faster">
          +
        </button>
      </div>
      <label className="speed-slider">
        <span className="slider-min">{formatSpeed(policy.min)}</span>
        <input
          type="range"
          min={policy.min}
          max={policy.max}
          step={policy.sliderStep}
          value={snapSliderSpeed(displaySpeed, policy)}
          disabled={disabled}
          onInput={(event) => {
            const next = snapSliderSpeed(Number(event.currentTarget.value), policy);
            event.currentTarget.value = String(next);
            onPreviewSlider?.(next);
          }}
          onPointerUp={(event) => {
            onCommitSlider(snapSliderSpeed(Number(event.currentTarget.value), policy));
          }}
          onKeyUp={(event) => {
            if (
              event.key === 'ArrowLeft' ||
              event.key === 'ArrowRight' ||
              event.key === 'Home' ||
              event.key === 'End'
            ) {
              onCommitSlider(snapSliderSpeed(Number(event.currentTarget.value), policy));
            }
          }}
        />
        <span className="slider-max">{formatSpeed(policy.max)}</span>
      </label>
    </div>
  );
}
