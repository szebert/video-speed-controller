// SPDX-License-Identifier: GPL-3.0-only
// Icon geometry is from Lucide (ISC), vendored in lucide-icons.ts.

import { classes } from './dom';
import { LUCIDE_ICONS } from './lucide-icons';

export type IconName = keyof typeof LUCIDE_ICONS;

export function icon(name: IconName, className = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', classes('shrink-0', className));
  for (const [tag, attrs] of LUCIDE_ICONS[name]) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'key') {
        continue;
      }
      node.setAttribute(key, String(value));
    }
    svg.append(node);
  }
  return svg;
}
