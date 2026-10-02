// SPDX-License-Identifier: GPL-3.0-only

import { classes, el } from '../dom';

export function rangeControl(options: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onInput?: (value: number) => void;
  onCommit?: (value: number) => void;
}): HTMLDivElement {
  const input = el('input', {
    class:
      'absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed',
    attrs: {
      type: 'range',
      min: options.min,
      max: options.max,
      step: options.step,
      'aria-label': options.label,
    },
  });
  input.value = String(options.value);
  input.disabled = Boolean(options.disabled);
  const fill = el('div', {
    class: 'absolute inset-y-0 start-0 bg-primary',
    attrs: { 'data-slot': 'slider-range' },
  });
  const track = el(
    'div',
    {
      class: 'relative h-1 w-full grow overflow-hidden rounded-full bg-muted',
      attrs: { 'data-slot': 'slider-track' },
    },
    fill,
  );
  const thumb = el('div', {
    class:
      'pointer-events-none absolute top-1/2 size-3 -translate-y-1/2 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow]',
    attrs: { 'data-slot': 'slider-thumb' },
  });
  const root = el(
    'div',
    {
      class: classes(
        'relative flex h-7 w-full touch-none items-center select-none has-[input:hover]:[&_[data-slot=slider-thumb]]:ring-3 has-[input:active]:[&_[data-slot=slider-thumb]]:ring-3 has-[input:focus-visible]:[&_[data-slot=slider-thumb]]:ring-3',
        options.disabled && 'opacity-50',
      ),
      attrs: {
        'data-slot': 'slider',
        'aria-label': options.label,
        'data-disabled': options.disabled ? 'true' : null,
      },
    },
    track,
    thumb,
    input,
  );
  const paint = (): void => {
    paintRange(root);
  };
  const emitInput = (): void => {
    paint();
    options.onInput?.(Number(input.value));
  };
  const stepBy = (direction: 1 | -1 | 'min' | 'max'): void => {
    const min = Number(input.min);
    const max = Number(input.max);
    const step = Number(input.step) || 1;
    const current = Number(input.value);
    const next = direction === 'min' ? min : direction === 'max' ? max : current + direction * step;
    input.value = String(Math.min(max, Math.max(min, next)));
    emitInput();
    options.onCommit?.(Number(input.value));
  };
  input.addEventListener('input', emitInput);
  input.addEventListener('change', () => {
    options.onCommit?.(Number(input.value));
  });
  root.addEventListener('keydown', (event) => {
    if (input.disabled) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      stepBy('min');
    } else if (event.key === 'End') {
      event.preventDefault();
      stepBy('max');
    }
  });
  paint();
  return root;
}

export function paintRange(root: HTMLElement): void {
  const input = root.querySelector('input[type="range"]');
  const fill = root.querySelector('[data-slot="slider-range"]');
  const thumb = root.querySelector('[data-slot="slider-thumb"]');
  if (!(input instanceof HTMLInputElement) || !(fill instanceof HTMLElement)) {
    return;
  }
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const span = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / span));
  fill.style.width = `${ratio * 100}%`;
  if (thumb instanceof HTMLElement) {
    thumb.style.left = `calc(${ratio * 100}% - 6px)`;
  }
}

export function syncRange(root: HTMLElement, value: number, disabled: boolean): void {
  const input = root.querySelector('input[type="range"]');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  if (document.activeElement !== input) {
    input.value = String(value);
  }
  input.disabled = disabled;
  root.toggleAttribute('data-disabled', disabled);
  root.classList.toggle('opacity-50', disabled);
  paintRange(root);
}
