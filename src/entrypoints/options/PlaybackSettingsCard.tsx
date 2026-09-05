// SPDX-License-Identifier: GPL-3.0-only

import { SpeedControls } from '@/components/SpeedControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import {
  SPEED_MAX_SETTING_MAX,
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MAX,
  SPEED_MIN_SETTING_MIN,
  SPEED_TICK_SETTING_MAX,
  SPEED_TICK_SETTING_MIN,
  type SpeedPolicy,
} from '../../core/speed';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import type { BehaviorSettingChange, EditableResolvedBehavior } from '../../settings/site-behavior';
import { InputGroupInheritReset } from './options-fields';
import {
  ownsOverride,
  resetFieldLabel,
  showsInherited,
  type DraftKey,
  type Selection,
} from './options-model';

export function PlaybackSettingsCard({
  selection,
  behavior,
  speed,
  drafts,
  pending,
  policy,
  sliderPreview,
  onMutate,
  onAdjustSpeed,
  onPreviewSlider,
  onDraftChange,
  onCommitDecimal,
}: {
  selection: Selection;
  behavior: EditableResolvedBehavior;
  speed: number;
  drafts: Partial<Record<DraftKey, string>>;
  pending: boolean;
  policy: SpeedPolicy;
  sliderPreview: number | null;
  onMutate: (change: BehaviorSettingChange) => void;
  onAdjustSpeed: (direction: 1 | -1) => void;
  onPreviewSlider: (speed: number | null) => void;
  onDraftChange: (key: Exclude<DraftKey, 'delay'>, value: string) => void;
  onCommitDecimal: (
    key: Exclude<DraftKey, 'delay'>,
    fallback: number,
    min: number,
    max: number,
  ) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsPlayback')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">{t('settingsPlayback')}</FieldLegend>
          <SpeedControls
            heading={selection.kind === 'global' ? t('defaultSpeed') : t('siteSpeed')}
            displaySpeed={speed}
            pending={pending}
            resetDisabled={!ownsOverride(selection, behavior.speed.source)}
            muted={showsInherited(selection, behavior.speed.source) && sliderPreview == null}
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
          <FieldGroup className="grid grid-cols-1 gap-4 @xl/field-group:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="speed-min">{t('speedMin')}</FieldLabel>
              <InputGroup isDisabled={pending}>
                <InputGroupInput
                  id="speed-min"
                  className={cn(
                    showsInherited(selection, behavior.speedMin.source, drafts.speedMin) &&
                      'text-muted-foreground',
                  )}
                  name="speedMin"
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min={SPEED_MIN_SETTING_MIN}
                  max={SPEED_MIN_SETTING_MAX}
                  step={SPEED_TICK_SETTING_MIN}
                  autoComplete="off"
                  disabled={pending}
                  value={drafts.speedMin ?? String(behavior.speedMin.value)}
                  onChange={(event) => {
                    onDraftChange('speedMin', event.target.value);
                  }}
                  onBlur={() => {
                    onCommitDecimal(
                      'speedMin',
                      behavior.speedMin.value,
                      SPEED_MIN_SETTING_MIN,
                      SPEED_MIN_SETTING_MAX,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onCommitDecimal(
                        'speedMin',
                        behavior.speedMin.value,
                        SPEED_MIN_SETTING_MIN,
                        SPEED_MIN_SETTING_MAX,
                      );
                    }
                  }}
                />
                <InputGroupInheritReset
                  active={ownsOverride(selection, behavior.speedMin.source)}
                  disabled={pending}
                  label={resetFieldLabel(t('speedMin'))}
                  onReset={() => {
                    onMutate({ kind: 'inherit', field: 'speedMin' });
                  }}
                />
              </InputGroup>
              <FieldDescription>{t('speedMinDescription')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="speed-tick">{t('speedTick')}</FieldLabel>
              <InputGroup isDisabled={pending}>
                <InputGroupInput
                  id="speed-tick"
                  className={cn(
                    showsInherited(selection, behavior.speedTick.source, drafts.speedTick) &&
                      'text-muted-foreground',
                  )}
                  name="speedTick"
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min={SPEED_TICK_SETTING_MIN}
                  max={SPEED_TICK_SETTING_MAX}
                  step={SPEED_TICK_SETTING_MIN}
                  autoComplete="off"
                  disabled={pending}
                  value={drafts.speedTick ?? String(behavior.speedTick.value)}
                  onChange={(event) => {
                    onDraftChange('speedTick', event.target.value);
                  }}
                  onBlur={() => {
                    onCommitDecimal(
                      'speedTick',
                      behavior.speedTick.value,
                      SPEED_TICK_SETTING_MIN,
                      SPEED_TICK_SETTING_MAX,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onCommitDecimal(
                        'speedTick',
                        behavior.speedTick.value,
                        SPEED_TICK_SETTING_MIN,
                        SPEED_TICK_SETTING_MAX,
                      );
                    }
                  }}
                />
                <InputGroupInheritReset
                  active={ownsOverride(selection, behavior.speedTick.source)}
                  disabled={pending}
                  label={resetFieldLabel(t('speedTick'))}
                  onReset={() => {
                    onMutate({ kind: 'inherit', field: 'speedTick' });
                  }}
                />
              </InputGroup>
              <FieldDescription>{t('speedTickDescription')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="speed-max">{t('speedMax')}</FieldLabel>
              <InputGroup isDisabled={pending}>
                <InputGroupInput
                  id="speed-max"
                  className={cn(
                    showsInherited(selection, behavior.speedMax.source, drafts.speedMax) &&
                      'text-muted-foreground',
                  )}
                  name="speedMax"
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min={SPEED_MAX_SETTING_MIN}
                  max={SPEED_MAX_SETTING_MAX}
                  step={0.05}
                  autoComplete="off"
                  disabled={pending}
                  value={drafts.speedMax ?? String(behavior.speedMax.value)}
                  onChange={(event) => {
                    onDraftChange('speedMax', event.target.value);
                  }}
                  onBlur={() => {
                    onCommitDecimal(
                      'speedMax',
                      behavior.speedMax.value,
                      SPEED_MAX_SETTING_MIN,
                      SPEED_MAX_SETTING_MAX,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onCommitDecimal(
                        'speedMax',
                        behavior.speedMax.value,
                        SPEED_MAX_SETTING_MIN,
                        SPEED_MAX_SETTING_MAX,
                      );
                    }
                  }}
                />
                <InputGroupInheritReset
                  active={ownsOverride(selection, behavior.speedMax.source)}
                  disabled={pending}
                  label={resetFieldLabel(t('speedMax'))}
                  onReset={() => {
                    onMutate({ kind: 'inherit', field: 'speedMax' });
                  }}
                />
              </InputGroup>
              <FieldDescription>{t('speedMaxDescription')}</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
