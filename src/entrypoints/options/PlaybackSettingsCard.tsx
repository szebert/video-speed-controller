// SPDX-License-Identifier: GPL-3.0-only

import { ResetBadge } from '@/components/ResetBadge';
import { SpeedControls } from '@/components/SpeedControls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import {
  SPEED_MAX_SETTING_MAX,
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MAX,
  SPEED_MIN_SETTING_MIN,
  SPEED_SLIDER_STEP,
  SPEED_TICK_SETTING_MAX,
  SPEED_TICK_SETTING_MIN,
  formatSpeed,
  isFixedSpeedPolicy,
  sliderBounds,
  sliderValue,
  snapSliderSpeed,
  type SpeedPolicy,
} from '../../core/speed';
import { t } from '@/i18n/t';
import { cn } from 'cn';
import type { BehaviorSettingChange, EditableResolvedBehavior } from '../../settings/site-behavior';
import {
  BehaviorSwitchField,
  OPTIONS_FIELD_GRID,
  OPTIONS_FIELD_SPAN,
  OptionsNumberField,
} from './options-fields';
import {
  ownsOverride,
  resetFieldLabel,
  resetToSpeedLabel,
  showsInherited,
  type DraftKey,
  type Selection,
} from './options-model';

export function PlaybackSettingsCard({
  selection,
  behavior,
  currentSpeed,
  currentSpeedMuted,
  defaultSpeed,
  drafts,
  pending,
  policy,
  resetBadgeText,
  onMutate,
  onAdjustSpeed,
  onPreviewSlider,
  onDraftChange,
  onCommitDecimal,
}: {
  selection: Selection;
  behavior: EditableResolvedBehavior;
  currentSpeed: number;
  currentSpeedMuted: boolean;
  defaultSpeed: number;
  drafts: Partial<Record<DraftKey, string>>;
  pending: boolean;
  policy: SpeedPolicy;
  resetBadgeText: string;
  onMutate: (change: BehaviorSettingChange) => void;
  onAdjustSpeed: (direction: 1 | -1) => void;
  onPreviewSlider: (preview: number | null) => void;
  onDraftChange: (
    key: Exclude<DraftKey, 'delay' | 'flashDelay' | 'hotkeyRepeatDelay'>,
    value: string,
  ) => void;
  onCommitDecimal: (
    key: Exclude<DraftKey, 'delay' | 'flashDelay' | 'hotkeyRepeatDelay'>,
    fallback: number,
    min: number,
    max: number,
  ) => void;
}) {
  const currentHeading =
    selection.kind === 'global' ? t('currentDefaultSpeed') : t('currentSiteSpeed');
  const defaultBounds = sliderBounds(policy);
  const defaultFixed = isFixedSpeedPolicy(policy);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsPlayback')}</CardTitle>
        <CardDescription>{t('settingsPlaybackDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">{t('settingsPlayback')}</FieldLegend>
          <FieldGroup className={OPTIONS_FIELD_GRID}>
            <div className={OPTIONS_FIELD_SPAN}>
              <SpeedControls
                heading={currentHeading}
                displaySpeed={currentSpeed}
                pending={pending}
                resetLabel={resetToSpeedLabel(defaultSpeed)}
                resetDisabled={!ownsOverride(selection, behavior.speed.source)}
                muted={currentSpeedMuted}
                policy={policy}
                onAdjust={onAdjustSpeed}
                onReset={() => {
                  onMutate({ kind: 'inherit', field: 'speed' });
                }}
                onPreviewSlider={onPreviewSlider}
                onCommitSlider={(value) => {
                  onMutate({ kind: 'value', field: 'speed', value });
                }}
              />
              <p className="mt-2 text-sm text-muted-foreground">{t('currentSpeedResetHint')}</p>
            </div>
            <Field className={OPTIONS_FIELD_SPAN} data-disabled={pending || undefined}>
              <div className="flex items-start justify-between gap-2">
                <FieldContent>
                  <FieldLabel id="default-speed-label">{t('defaultSpeed')}</FieldLabel>
                  <FieldDescription id="default-speed-help">
                    {t('defaultSpeedDescription')}
                  </FieldDescription>
                </FieldContent>
                <ResetBadge
                  active={ownsOverride(selection, behavior.defaultSpeed.source)}
                  disabled={pending}
                  text={resetBadgeText}
                  label={resetFieldLabel(t('defaultSpeed'))}
                  onReset={() => {
                    onMutate({ kind: 'inherit', field: 'defaultSpeed' });
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  key={`${policy.min}:${policy.max}`}
                  aria-label={t('defaultSpeed')}
                  aria-labelledby="default-speed-label"
                  aria-describedby="default-speed-help"
                  isDisabled={pending || defaultFixed}
                  minValue={defaultBounds.minValue}
                  maxValue={defaultBounds.maxValue}
                  step={SPEED_SLIDER_STEP}
                  value={sliderValue(defaultSpeed, policy)}
                  onChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (next == null) {
                      return;
                    }
                    onMutate({
                      kind: 'value',
                      field: 'defaultSpeed',
                      value: snapSliderSpeed(next, policy),
                    });
                  }}
                />
                <span
                  className={cn(
                    'w-14 shrink-0 text-right text-sm tabular-nums',
                    showsInherited(selection, behavior.defaultSpeed.source) &&
                      'text-muted-foreground',
                  )}
                >
                  {formatSpeed(defaultSpeed)}
                </span>
              </div>
            </Field>
            <BehaviorSwitchField
              id="remember-last-speed"
              name="rememberLastSpeed"
              field="rememberLastSpeed"
              className={OPTIONS_FIELD_SPAN}
              label={t('rememberLastSpeed')}
              description={t('rememberLastSpeedDescription')}
              setting={behavior.rememberLastSpeed}
              selection={selection}
              disabled={pending}
              resetBadgeText={resetBadgeText}
              onMutate={onMutate}
            />
            <OptionsNumberField
              id="speed-min"
              name="speedMin"
              label={t('speedMin')}
              description={t('speedMinDescription')}
              min={SPEED_MIN_SETTING_MIN}
              max={SPEED_MIN_SETTING_MAX}
              step={SPEED_TICK_SETTING_MIN}
              value={drafts.speedMin ?? String(behavior.speedMin.value)}
              disabled={pending}
              muted={showsInherited(selection, behavior.speedMin.source, drafts.speedMin)}
              resetActive={ownsOverride(selection, behavior.speedMin.source)}
              resetLabel={resetFieldLabel(t('speedMin'))}
              onDraftChange={(value) => {
                onDraftChange('speedMin', value);
              }}
              onCommit={() => {
                onCommitDecimal(
                  'speedMin',
                  behavior.speedMin.value,
                  SPEED_MIN_SETTING_MIN,
                  SPEED_MIN_SETTING_MAX,
                );
              }}
              onReset={() => {
                onMutate({ kind: 'inherit', field: 'speedMin' });
              }}
            />
            <OptionsNumberField
              id="speed-max"
              name="speedMax"
              label={t('speedMax')}
              description={t('speedMaxDescription')}
              min={SPEED_MAX_SETTING_MIN}
              max={SPEED_MAX_SETTING_MAX}
              step={0.05}
              value={drafts.speedMax ?? String(behavior.speedMax.value)}
              disabled={pending}
              muted={showsInherited(selection, behavior.speedMax.source, drafts.speedMax)}
              resetActive={ownsOverride(selection, behavior.speedMax.source)}
              resetLabel={resetFieldLabel(t('speedMax'))}
              onDraftChange={(value) => {
                onDraftChange('speedMax', value);
              }}
              onCommit={() => {
                onCommitDecimal(
                  'speedMax',
                  behavior.speedMax.value,
                  SPEED_MAX_SETTING_MIN,
                  SPEED_MAX_SETTING_MAX,
                );
              }}
              onReset={() => {
                onMutate({ kind: 'inherit', field: 'speedMax' });
              }}
            />
            <OptionsNumberField
              id="speed-tick"
              name="speedTick"
              className={OPTIONS_FIELD_SPAN}
              label={t('speedTick')}
              description={t('speedTickDescription')}
              min={SPEED_TICK_SETTING_MIN}
              max={SPEED_TICK_SETTING_MAX}
              step={SPEED_TICK_SETTING_MIN}
              value={drafts.speedTick ?? String(behavior.speedTick.value)}
              disabled={pending}
              muted={showsInherited(selection, behavior.speedTick.source, drafts.speedTick)}
              resetActive={ownsOverride(selection, behavior.speedTick.source)}
              resetLabel={resetFieldLabel(t('speedTick'))}
              onDraftChange={(value) => {
                onDraftChange('speedTick', value);
              }}
              onCommit={() => {
                onCommitDecimal(
                  'speedTick',
                  behavior.speedTick.value,
                  SPEED_TICK_SETTING_MIN,
                  SPEED_TICK_SETTING_MAX,
                );
              }}
              onReset={() => {
                onMutate({ kind: 'inherit', field: 'speedTick' });
              }}
            />
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
