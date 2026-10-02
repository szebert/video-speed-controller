// SPDX-License-Identifier: GPL-3.0-only

import {
  canAdjustSpeed,
  DEFAULT_SPEED_POLICY,
  formatSpeed,
  isFixedSpeedPolicy,
  resolveEffectiveSpeed,
  sliderBounds,
  sliderValue,
  snapSliderSpeed,
  SPEED_SLIDER_STEP,
  type SpeedPolicy,
} from '@/core/speed';
import { t } from '@/i18n/t';
import { badge } from './components/badge';
import { button } from './components/button';
import { buttonGroup } from './components/button-group';
import { rangeControl } from './components/slider';
import { el } from './dom';

export function speedControls(options: {
  displaySpeed: number;
  disabled?: boolean;
  heading?: string;
  resetLabel?: string;
  policy?: SpeedPolicy;
  onAdjust: (direction: 1 | -1) => void;
  onReset: () => void;
  onPreviewSlider?: (speed: number) => void;
  onCommitSlider: (speed: number) => void;
}): HTMLElement {
  const policy = options.policy ?? DEFAULT_SPEED_POLICY;
  const shown = resolveEffectiveSpeed(options.displaySpeed, policy);
  const locked = Boolean(options.disabled);
  const fixed = isFixedSpeedPolicy(policy);
  const bounds = sliderBounds(policy);
  const label = options.heading ?? t('currentSiteSpeed');
  const slider = fixed
    ? el(
        'div',
        {
          class: 'relative flex h-7 w-full items-center opacity-50',
          attrs: { 'data-slot': 'slider', 'data-disabled': 'true', 'aria-hidden': 'true' },
        },
        el(
          'div',
          {
            class: 'relative h-1 w-full grow overflow-hidden rounded-full bg-muted',
            attrs: { 'data-slot': 'slider-track' },
          },
          el('div', {
            class: 'absolute inset-y-0 start-0 end-0 bg-primary',
            attrs: { 'data-slot': 'slider-range' },
          }),
        ),
        el('div', {
          class:
            'pointer-events-none absolute end-0 top-1/2 size-3 -translate-y-1/2 rounded-full border border-ring bg-white',
          attrs: { 'data-slot': 'slider-thumb' },
        }),
      )
    : rangeControl({
        label,
        min: bounds.minValue,
        max: bounds.maxValue,
        step: SPEED_SLIDER_STEP,
        value: sliderValue(shown, policy),
        disabled: locked,
        onInput: (value) => options.onPreviewSlider?.(snapSliderSpeed(value, policy)),
        onCommit: (value) => options.onCommitSlider(snapSliderSpeed(value, policy)),
      });
  return el(
    'div',
    { class: 'flex flex-col gap-3' },
    el(
      'div',
      { class: 'flex items-center justify-between gap-3' },
      el('h2', { class: 'text-sm font-medium', text: label }),
      locked ? badge(t('disabled'), 'secondary') : null,
    ),
    el('div', {
      class: 'text-center text-3xl font-semibold tabular-nums',
      attrs: { 'aria-live': 'polite', 'data-slot': 'speed-readout' },
      text: formatSpeed(shown),
    }),
    buttonGroup(
      { label, full: true },
      button(null, {
        variant: 'outline',
        icon: 'minus',
        class: 'flex-1',
        disabled: locked || fixed || !canAdjustSpeed(shown, -1, policy),
        attrs: { 'aria-label': t('slower') },
        onClick: () => options.onAdjust(-1),
      }),
      button(options.resetLabel ?? t('reset'), {
        variant: 'outline',
        class: 'flex-1',
        disabled: locked,
        onClick: () => options.onReset(),
      }),
      button(null, {
        variant: 'outline',
        icon: 'plus',
        class: 'flex-1',
        disabled: locked || fixed || !canAdjustSpeed(shown, 1, policy),
        attrs: { 'aria-label': t('faster') },
        onClick: () => options.onAdjust(1),
      }),
    ),
    el(
      'div',
      { class: 'flex items-center gap-2 text-xs text-muted-foreground' },
      el('span', { text: formatSpeed(policy.min) }),
      slider,
      el('span', { text: formatSpeed(policy.max) }),
    ),
  );
}
