// SPDX-License-Identifier: GPL-3.0-only

import { ResetBadge } from '@/components/ResetBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { RadioButton, RadioField, RadioGroup } from '@/components/ui/radio-group';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import {
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  type BehaviorSettingChange,
  type EditableResolvedBehavior,
  type OverlayPosition,
} from '../../settings/site-behavior';
import { InputGroupInheritReset, OverlaySwitchField } from './options-fields';
import {
  ownsOverride,
  POSITION_OPTIONS,
  resetFieldLabel,
  showsInherited,
  type DraftKey,
  type Selection,
} from './options-model';

export function OverlaySettingsCard({
  selection,
  behavior,
  drafts,
  delaySeconds,
  pending,
  overlayLocked,
  delayLocked,
  resetBadgeText,
  onMutate,
  onDraftChange,
  onCommitDelay,
}: {
  selection: Selection;
  behavior: EditableResolvedBehavior;
  drafts: Partial<Record<DraftKey, string>>;
  delaySeconds: string;
  pending: boolean;
  overlayLocked: boolean;
  delayLocked: boolean;
  resetBadgeText: string;
  onMutate: (change: BehaviorSettingChange) => void;
  onDraftChange: (value: string) => void;
  onCommitDelay: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsOverlay')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">{t('settingsOverlay')}</FieldLegend>
          <OverlaySwitchField
            id="overlay-visible"
            name="overlayVisible"
            field="overlayVisible"
            label={t('overlayVisible')}
            description={t('overlayVisibleDescription')}
            setting={behavior.overlayVisible}
            selection={selection}
            disabled={pending}
            resetBadgeText={resetBadgeText}
            onMutate={onMutate}
          />
          <Field data-disabled={overlayLocked || undefined}>
            <div className="flex items-start justify-between gap-2">
              <FieldContent>
                <FieldLabel>{t('overlayPosition')}</FieldLabel>
                <FieldDescription id="overlay-position-help">
                  {t('overlayPositionDescription')}
                </FieldDescription>
              </FieldContent>
              <ResetBadge
                active={ownsOverride(selection, behavior.overlayPosition.source)}
                disabled={overlayLocked}
                text={resetBadgeText}
                label={resetFieldLabel(t('overlayPosition'))}
                onReset={() => {
                  onMutate({ kind: 'inherit', field: 'overlayPosition' });
                }}
              />
            </div>
            <RadioGroup
              name="overlayPosition"
              aria-label={t('overlayPosition')}
              aria-describedby="overlay-position-help"
              className="grid grid-cols-3 gap-2"
              isDisabled={overlayLocked}
              value={String(behavior.overlayPosition.value)}
              onChange={(value) => {
                onMutate({
                  kind: 'value',
                  field: 'overlayPosition',
                  value: Number(value) as OverlayPosition,
                });
              }}
            >
              {POSITION_OPTIONS.map((option) => (
                <RadioField key={option.value} value={String(option.value)} className="contents">
                  <RadioButton
                    className={cn(
                      'rounded-md border border-border px-2 py-2 text-center text-xs',
                      showsInherited(selection, behavior.overlayPosition.source)
                        ? 'data-selected:bg-muted data-selected:text-muted-foreground'
                        : 'data-selected:bg-accent',
                    )}
                  >
                    {t(option.labelKey)}
                  </RadioButton>
                </RadioField>
              ))}
            </RadioGroup>
          </Field>
          <FieldGroup className="grid grid-cols-1 gap-4 @md/field-group:grid-cols-2">
            <OverlaySwitchField
              id="overlay-position-button"
              name="overlayPositionButton"
              field="overlayPositionButton"
              label={t('overlayPositionButton')}
              description={t('overlayPositionButtonDescription')}
              setting={behavior.overlayPositionButton}
              selection={selection}
              disabled={overlayLocked}
              resetBadgeText={resetBadgeText}
              onMutate={onMutate}
            />
            <OverlaySwitchField
              id="overlay-settings-button"
              name="overlaySettingsButton"
              field="overlaySettingsButton"
              label={t('overlaySettingsButton')}
              description={t('overlaySettingsButtonDescription')}
              setting={behavior.overlaySettingsButton}
              selection={selection}
              disabled={overlayLocked}
              resetBadgeText={resetBadgeText}
              onMutate={onMutate}
            />
          </FieldGroup>
          <FieldGroup className="grid grid-cols-1 gap-4 @xl/field-group:grid-cols-3">
            <OverlaySwitchField
              id="overlay-auto-hide"
              name="overlayAutoHide"
              field="overlayAutoHide"
              label={t('overlayAutoHide')}
              description={t('overlayAutoHideDescription')}
              setting={behavior.overlayAutoHide}
              selection={selection}
              disabled={overlayLocked}
              resetBadgeText={resetBadgeText}
              onMutate={onMutate}
            />
            <Field data-disabled={delayLocked || undefined}>
              <FieldLabel htmlFor="overlay-auto-hide-delay">{t('overlayAutoHideDelay')}</FieldLabel>
              <InputGroup isDisabled={delayLocked}>
                <InputGroupInput
                  id="overlay-auto-hide-delay"
                  className={cn(
                    showsInherited(
                      selection,
                      behavior.overlayAutoHideDelayMs.source,
                      drafts.delay,
                    ) && 'text-muted-foreground',
                  )}
                  name="overlayAutoHideDelay"
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min={OVERLAY_AUTO_HIDE_DELAY_MS_MIN / 1000}
                  max={OVERLAY_AUTO_HIDE_DELAY_MS_MAX / 1000}
                  step={0.1}
                  autoComplete="off"
                  disabled={delayLocked}
                  value={drafts.delay ?? delaySeconds}
                  aria-describedby="overlay-auto-hide-delay-help"
                  onChange={(event) => {
                    onDraftChange(event.target.value);
                  }}
                  onBlur={onCommitDelay}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onCommitDelay();
                    }
                  }}
                />
                <InputGroupInheritReset
                  active={ownsOverride(selection, behavior.overlayAutoHideDelayMs.source)}
                  disabled={delayLocked}
                  label={resetFieldLabel(t('overlayAutoHideDelay'))}
                  onReset={() => {
                    onMutate({ kind: 'inherit', field: 'overlayAutoHideDelayMs' });
                  }}
                />
              </InputGroup>
              <FieldDescription id="overlay-auto-hide-delay-help">
                {t('overlayAutoHideDelayDescription')}
              </FieldDescription>
            </Field>
            <OverlaySwitchField
              id="overlay-hover-hold"
              name="overlayHoverHold"
              field="overlayHoverHold"
              label={t('overlayHoverHold')}
              description={t('overlayHoverHoldDescription')}
              setting={behavior.overlayHoverHold}
              selection={selection}
              disabled={delayLocked}
              resetBadgeText={resetBadgeText}
              onMutate={onMutate}
            />
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
