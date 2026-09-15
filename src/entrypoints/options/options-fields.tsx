// SPDX-License-Identifier: GPL-3.0-only

import { XIcon } from 'lucide-react';
import { ResetBadge } from '@/components/ResetBadge';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { cn } from 'cn';
import type { BehaviorSettingChange, SettingSource } from '../../settings/site-behavior';
import {
  handleNumberInputKeyDown,
  numberInputDraftAfterChange,
  numberInputMin,
  ownsOverride,
  resetFieldLabel,
  showsInherited,
  type BooleanBehaviorFieldName,
  type Selection,
} from './options-model';

export const OPTIONS_FIELD_GRID = 'lg:grid lg:grid-cols-2 lg:items-start';
export const OPTIONS_FIELD_SPAN = 'lg:col-span-2';

export function BehaviorSwitchField({
  id,
  name,
  field,
  label,
  description,
  setting,
  selection,
  disabled,
  resetBadgeText,
  className,
  onMutate,
}: {
  id: string;
  name: string;
  field: BooleanBehaviorFieldName;
  label: string;
  description: string;
  setting: { value: boolean; source: SettingSource };
  selection: Selection;
  disabled: boolean;
  resetBadgeText: string;
  className?: string;
  onMutate: (change: BehaviorSettingChange) => void;
}) {
  const helpId = `${id}-help`;
  return (
    <Field
      orientation="horizontal"
      className={cn('min-w-0', className)}
      data-disabled={disabled || undefined}
    >
      <FieldContent className="min-w-0 flex-[1_1_12rem]">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={helpId}>{description}</FieldDescription>
      </FieldContent>
      <div className="flex max-w-full flex-wrap-reverse items-center justify-end gap-2">
        <ResetBadge
          active={ownsOverride(selection, setting.source)}
          disabled={disabled}
          text={resetBadgeText}
          label={resetFieldLabel(label)}
          onReset={() => {
            onMutate({ kind: 'inherit', field });
          }}
        />
        <Switch
          id={id}
          name={name}
          className={
            showsInherited(selection, setting.source)
              ? 'data-selected:bg-muted-foreground'
              : undefined
          }
          aria-describedby={helpId}
          isDisabled={disabled}
          isSelected={setting.value}
          onChange={(selected) => {
            onMutate({ kind: 'value', field, value: selected });
          }}
        />
      </div>
    </Field>
  );
}

export function OptionsNumberField({
  id,
  name,
  label,
  description,
  min,
  max,
  step,
  value,
  disabled,
  muted,
  resetActive,
  resetLabel,
  className,
  onDraftChange,
  onCommit,
  onReset,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: string;
  disabled?: boolean;
  muted?: boolean;
  resetActive: boolean;
  resetLabel: string;
  className?: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const helpId = `${id}-help`;
  return (
    <Field className={className} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup isDisabled={disabled}>
        <InputGroupInput
          id={id}
          className={cn(muted && 'text-muted-foreground')}
          name={name}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          min={numberInputMin(min, step)}
          max={max}
          step={step}
          autoComplete="off"
          disabled={disabled}
          value={value}
          aria-describedby={helpId}
          onChange={(event) => {
            const next = numberInputDraftAfterChange(
              value,
              event.currentTarget.value,
              min,
              max,
              step,
            );
            if (next !== event.currentTarget.value) {
              event.currentTarget.value = next;
            }
            onDraftChange(next);
          }}
          onBlur={onCommit}
          onKeyDown={(event) => {
            handleNumberInputKeyDown(event, value, min, max, step, onDraftChange, onCommit);
          }}
        />
        <InputGroupInheritReset
          active={resetActive}
          disabled={disabled}
          label={resetLabel}
          onReset={onReset}
        />
      </InputGroup>
      <FieldDescription id={helpId}>{description}</FieldDescription>
    </Field>
  );
}

export function InputGroupInheritReset({
  active,
  disabled,
  label,
  onReset,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onReset: () => void;
}) {
  if (!active) {
    return null;
  }
  return (
    <InputGroupAddon align="inline-end">
      <InputGroupButton
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        isDisabled={disabled}
        className="data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50"
        onPress={onReset}
      >
        <XIcon />
      </InputGroupButton>
    </InputGroupAddon>
  );
}
