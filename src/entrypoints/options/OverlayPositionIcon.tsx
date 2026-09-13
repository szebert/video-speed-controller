// SPDX-License-Identifier: GPL-3.0-only

import { overlayPositionToGrid, type OverlayPosition } from '../../settings/site-behavior';

const AXIS = [4, 8.5, 13] as const;
const BOX = 7;

const FRAME_DOTS = [
  [4, 4],
  [9, 4],
  [15, 4],
  [20, 4],
  [20, 9],
  [20, 15],
  [20, 20],
  [15, 20],
  [9, 20],
  [4, 20],
  [4, 15],
  [4, 9],
] as const;

export function OverlayPositionIcon({
  position,
  className,
}: {
  position: OverlayPosition;
  className?: string;
}) {
  const { row, column } = overlayPositionToGrid(position);

  const x = AXIS[column];
  const y = AXIS[row];

  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={x} y={y} width={BOX} height={BOX} rx="1" />

      {FRAME_DOTS.filter(
        ([dotX, dotY]) => dotX < x || dotX > x + BOX || dotY < y || dotY > y + BOX,
      ).map(([dotX, dotY]) => (
        <path key={`${dotX}-${dotY}`} d={`M${dotX} ${dotY}h-.01`} />
      ))}
    </svg>
  );
}
