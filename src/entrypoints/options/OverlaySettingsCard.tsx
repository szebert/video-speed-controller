// SPDX-License-Identifier: GPL-3.0-only

import { ResetBadge } from '@/components/ResetBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { RadioButton, RadioField, RadioGroup } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { t } from '@/i18n/t';
import { cn } from 'cn';
import {
  canonicalizeFlashOpacity,
  canonicalizeOverlayOpacity,
  FLASH_DELAY_MS_MAX,
  FLASH_DELAY_MS_MIN,
  FLASH_OPACITY_MAX,
  FLASH_OPACITY_MIN,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  OVERLAY_OPACITY_MAX,
  OVERLAY_OPACITY_MIN,
  type BehaviorSettingChange,
  type EditableResolvedBehavior,
  type OverlayPosition,
} from '../../settings/site-behavior';
import { OverlayPositionIcon } from './OverlayPositionIcon';
import { BehaviorSwitchField, OptionsNumberField } from './options-fields';
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
  flashDelaySeconds,
  pending,
  overlayLocked,
  delayLocked,
  flashLocked,
  resetBadgeText,
  onMutate,
  onDraftChange,
  onCommitDelay,
  onCommitFlashDelay,
}: {
  selection: Selection;
  behavior: EditableResolvedBehavior;
  drafts: Partial<Record<DraftKey, string>>;
  delaySeconds: string;
  flashDelaySeconds: string;
  pending: boolean;
  overlayLocked: boolean;
  delayLocked: boolean;
  flashLocked: boolean;
  resetBadgeText: string;
  onMutate: (change: BehaviorSettingChange) => void;
  onDraftChange: (key: 'delay' | 'flashDelay', value: string) => void;
  onCommitDelay: () => void;
  onCommitFlashDelay: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsOverlay')}</CardTitle>
        <CardDescription>{t('settingsOverlayDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">{t('settingsOverlay')}</FieldLegend>
          <BehaviorSwitchField
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
          <BehaviorSwitchField
            id="overlay-navigation-bar"
            name="overlayNavigationBar"
            field="overlayNavigationBar"
            label={t('overlayNavigationBar')}
            description={t('overlayNavigationBarDescription')}
            setting={behavior.overlayNavigationBar}
            selection={selection}
            disabled={overlayLocked}
            resetBadgeText={resetBadgeText}
            onMutate={onMutate}
          />
          <Field data-disabled={overlayLocked || undefined}>
            <div className="flex items-start justify-between gap-2">
              <FieldContent>
                <FieldLabel id="overlay-opacity-label">{t('overlayOpacity')}</FieldLabel>
                <FieldDescription id="overlay-opacity-help">
                  {t('overlayOpacityDescription')}
                </FieldDescription>
              </FieldContent>
              <ResetBadge
                active={ownsOverride(selection, behavior.overlayOpacity.source)}
                disabled={overlayLocked}
                text={resetBadgeText}
                label={resetFieldLabel(t('overlayOpacity'))}
                onReset={() => {
                  onMutate({ kind: 'inherit', field: 'overlayOpacity' });
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Slider
                aria-label={t('overlayOpacity')}
                aria-labelledby="overlay-opacity-label"
                aria-describedby="overlay-opacity-help"
                isDisabled={overlayLocked}
                minValue={OVERLAY_OPACITY_MIN}
                maxValue={OVERLAY_OPACITY_MAX}
                step={1}
                formatOptions={{ style: 'unit', unit: 'percent', maximumFractionDigits: 0 }}
                value={behavior.overlayOpacity.value}
                onChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  if (next == null) {
                    return;
                  }
                  onMutate({
                    kind: 'value',
                    field: 'overlayOpacity',
                    value: canonicalizeOverlayOpacity(next),
                  });
                }}
              />
              <span
                className={cn(
                  'w-10 shrink-0 text-right text-sm tabular-nums',
                  showsInherited(selection, behavior.overlayOpacity.source) &&
                    'text-muted-foreground',
                )}
              >
                {`${behavior.overlayOpacity.value}%`}
              </span>
            </div>
          </Field>
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
                      'flex items-center justify-center gap-2 rounded-md border border-border px-2 py-2 text-center text-xs',
                      showsInherited(selection, behavior.overlayPosition.source)
                        ? 'data-selected:bg-muted data-selected:text-muted-foreground'
                        : 'data-selected:bg-accent',
                    )}
                  >
                    <OverlayPositionIcon position={option.value} className="size-6 shrink-0" />
                    {t(option.labelKey)}
                  </RadioButton>
                </RadioField>
              ))}
            </RadioGroup>
          </Field>
          <BehaviorSwitchField
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
          <BehaviorSwitchField
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
          <BehaviorSwitchField
            id="overlay-hotkey-hints"
            name="overlayHotkeyHints"
            field="overlayHotkeyHints"
            label={t('overlayHotkeyHints')}
            description={t('overlayHotkeyHintsDescription')}
            setting={behavior.overlayHotkeyHints}
            selection={selection}
            disabled={overlayLocked}
            resetBadgeText={resetBadgeText}
            onMutate={onMutate}
          />
          <BehaviorSwitchField
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
          <OptionsNumberField
            id="overlay-auto-hide-delay"
            name="overlayAutoHideDelay"
            label={t('overlayAutoHideDelay')}
            description={t('overlayAutoHideDelayDescription')}
            min={OVERLAY_AUTO_HIDE_DELAY_MS_MIN / 1000}
            max={OVERLAY_AUTO_HIDE_DELAY_MS_MAX / 1000}
            step={0.1}
            value={drafts.delay ?? delaySeconds}
            disabled={delayLocked}
            muted={showsInherited(selection, behavior.overlayAutoHideDelayMs.source, drafts.delay)}
            resetActive={ownsOverride(selection, behavior.overlayAutoHideDelayMs.source)}
            resetLabel={resetFieldLabel(t('overlayAutoHideDelay'))}
            onDraftChange={(value) => {
              onDraftChange('delay', value);
            }}
            onCommit={onCommitDelay}
            onReset={() => {
              onMutate({ kind: 'inherit', field: 'overlayAutoHideDelayMs' });
            }}
          />
          <BehaviorSwitchField
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
          <BehaviorSwitchField
            id="button-flash"
            name="buttonFlash"
            field="buttonFlash"
            label={t('buttonFlash')}
            description={t('buttonFlashDescription')}
            setting={behavior.buttonFlash}
            selection={selection}
            disabled={pending}
            resetBadgeText={resetBadgeText}
            onMutate={onMutate}
          />
          <BehaviorSwitchField
            id="hotkey-flash"
            name="hotkeyFlash"
            field="hotkeyFlash"
            label={t('hotkeyFlash')}
            description={t('hotkeyFlashDescription')}
            setting={behavior.hotkeyFlash}
            selection={selection}
            disabled={pending}
            resetBadgeText={resetBadgeText}
            onMutate={onMutate}
          />
          <OptionsNumberField
            id="flash-delay"
            name="flashDelay"
            label={t('flashDelay')}
            description={t('flashDelayDescription')}
            min={FLASH_DELAY_MS_MIN / 1000}
            max={FLASH_DELAY_MS_MAX / 1000}
            step={0.1}
            value={drafts.flashDelay ?? flashDelaySeconds}
            disabled={flashLocked}
            muted={showsInherited(selection, behavior.flashDelayMs.source, drafts.flashDelay)}
            resetActive={ownsOverride(selection, behavior.flashDelayMs.source)}
            resetLabel={resetFieldLabel(t('flashDelay'))}
            onDraftChange={(value) => {
              onDraftChange('flashDelay', value);
            }}
            onCommit={onCommitFlashDelay}
            onReset={() => {
              onMutate({ kind: 'inherit', field: 'flashDelayMs' });
            }}
          />
          <Field data-disabled={flashLocked || undefined}>
            <div className="flex items-start justify-between gap-2">
              <FieldContent>
                <FieldLabel id="flash-opacity-label">{t('flashOpacity')}</FieldLabel>
                <FieldDescription id="flash-opacity-help">
                  {t('flashOpacityDescription')}
                </FieldDescription>
              </FieldContent>
              <ResetBadge
                active={ownsOverride(selection, behavior.flashOpacity.source)}
                disabled={flashLocked}
                text={resetBadgeText}
                label={resetFieldLabel(t('flashOpacity'))}
                onReset={() => {
                  onMutate({ kind: 'inherit', field: 'flashOpacity' });
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Slider
                aria-label={t('flashOpacity')}
                aria-labelledby="flash-opacity-label"
                aria-describedby="flash-opacity-help"
                isDisabled={flashLocked}
                minValue={FLASH_OPACITY_MIN}
                maxValue={FLASH_OPACITY_MAX}
                step={1}
                formatOptions={{ style: 'unit', unit: 'percent', maximumFractionDigits: 0 }}
                value={behavior.flashOpacity.value}
                onChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  if (next == null) {
                    return;
                  }
                  onMutate({
                    kind: 'value',
                    field: 'flashOpacity',
                    value: canonicalizeFlashOpacity(next),
                  });
                }}
              />
              <span
                className={cn(
                  'w-10 shrink-0 text-right text-sm tabular-nums',
                  showsInherited(selection, behavior.flashOpacity.source) &&
                    'text-muted-foreground',
                )}
              >
                {`${behavior.flashOpacity.value}%`}
              </span>
            </div>
          </Field>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
