// SPDX-License-Identifier: GPL-3.0-only

import { XIcon } from 'lucide-react';
import { ResetBadge } from '@/components/ResetBadge';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import type { BehaviorSettingChange, SettingSource } from '../../settings/site-behavior';
import {
  ownsOverride,
  resetFieldLabel,
  showsInherited,
  type OverlaySwitchFieldName,
  type Selection,
} from './options-model';

export function OverlaySwitchField({
  id,
  name,
  field,
  label,
  description,
  setting,
  selection,
  disabled,
  resetBadgeText,
  onMutate,
}: {
  id: string;
  name: string;
  field: OverlaySwitchFieldName;
  label: string;
  description: string;
  setting: { value: boolean; source: SettingSource };
  selection: Selection;
  disabled: boolean;
  resetBadgeText: string;
  onMutate: (change: BehaviorSettingChange) => void;
}) {
  const helpId = `${id}-help`;
  return (
    <Field orientation="horizontal" className="min-w-0" data-disabled={disabled || undefined}>
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
