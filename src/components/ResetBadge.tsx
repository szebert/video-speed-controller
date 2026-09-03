// SPDX-License-Identifier: GPL-3.0-only

import { XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ResetBadgeProps = {
  active: boolean;
  disabled?: boolean;
  text: string;
  label: string;
  onReset: () => void;
};

export function ResetBadge({ active, disabled, text, label, onReset }: ResetBadgeProps) {
  const isDisabled = Boolean(disabled) || !active;
  return (
    <Badge
      variant="secondary"
      data-slot="reset-badge"
      data-active={active || undefined}
      data-disabled={isDisabled || undefined}
      className={cn(
        !active && 'invisible pointer-events-none',
        isDisabled && 'bg-muted text-muted-foreground opacity-50',
      )}
    >
      {text}
      <span className={cn('inline-flex', isDisabled && 'cursor-not-allowed')}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          isDisabled={isDisabled}
          className="size-4 rounded-full disabled:opacity-100"
          onPress={onReset}
        >
          <XIcon />
        </Button>
      </span>
    </Badge>
  );
}
