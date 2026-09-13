// SPDX-License-Identifier: GPL-3.0-only

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { OverlayPositionIcon } from '../entrypoints/options/OverlayPositionIcon';
import {
  OVERLAY_POSITION,
  overlayPositionToGrid,
  type OverlayPosition,
} from '../settings/site-behavior';

const AXIS = [4, 8.5, 13] as const;
const BOX = 7;

describe('OverlayPositionIcon', () => {
  let root: Root | null = null;
  let container: HTMLElement;

  function renderIcon(position: OverlayPosition, className?: string): SVGSVGElement {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(<OverlayPositionIcon position={position} className={className} />);
    });
    const svg = container.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) {
      throw new Error('OverlayPositionIcon did not render an svg');
    }
    return svg;
  }

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    document.body.replaceChildren();
  });

  it('keeps the svg decorative and places the box from overlayPositionToGrid', () => {
    const cases = Object.values(OVERLAY_POSITION).map((position) => {
      const { row, column } = overlayPositionToGrid(position);
      return { position, x: AXIS[column], y: AXIS[row] };
    });

    for (const { position, x, y } of cases) {
      const svg = renderIcon(position, 'size-6');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('class')).toBe('size-6');
      const rect = svg.querySelector('rect');
      expect(rect?.getAttribute('x')).toBe(String(x));
      expect(rect?.getAttribute('y')).toBe(String(y));
      expect(rect?.getAttribute('width')).toBe(String(BOX));
      expect(rect?.getAttribute('height')).toBe(String(BOX));
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it('hides only the perimeter dots covered by the box', () => {
    const expectedHidden = {
      [OVERLAY_POSITION.TOP_LEFT]: ['M4 4h-.01', 'M9 4h-.01', 'M4 9h-.01'],
      [OVERLAY_POSITION.TOP_CENTER]: ['M9 4h-.01', 'M15 4h-.01'],
      [OVERLAY_POSITION.TOP_RIGHT]: ['M15 4h-.01', 'M20 4h-.01', 'M20 9h-.01'],
      [OVERLAY_POSITION.CENTER_LEFT]: ['M4 9h-.01', 'M4 15h-.01'],
      [OVERLAY_POSITION.CENTER]: [],
      [OVERLAY_POSITION.CENTER_RIGHT]: ['M20 9h-.01', 'M20 15h-.01'],
      [OVERLAY_POSITION.BOTTOM_LEFT]: ['M4 15h-.01', 'M4 20h-.01', 'M9 20h-.01'],
      [OVERLAY_POSITION.BOTTOM_CENTER]: ['M9 20h-.01', 'M15 20h-.01'],
      [OVERLAY_POSITION.BOTTOM_RIGHT]: ['M15 20h-.01', 'M20 20h-.01', 'M20 15h-.01'],
    } satisfies Record<OverlayPosition, readonly string[]>;

    for (const [position, hidden] of Object.entries(expectedHidden)) {
      const svg = renderIcon(Number(position) as OverlayPosition);
      const dots = [...svg.querySelectorAll('path')].map((path) => path.getAttribute('d'));
      expect(dots).toHaveLength(12 - hidden.length);
      for (const path of hidden) {
        expect(dots).not.toContain(path);
      }
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });
});
