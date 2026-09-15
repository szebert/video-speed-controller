// SPDX-License-Identifier: GPL-3.0-only

import { SpeedControls } from '@/components/SpeedControls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldLegend, FieldSet } from '@/components/ui/field';
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
import type { BehaviorSettingChange, EditableResolvedBehavior } from '../../settings/site-behavior';
import { OptionsNumberField } from './options-fields';
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsPlayback')}</CardTitle>
        <CardDescription>{t('settingsPlaybackDescription')}</CardDescription>
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
            id="speed-tick"
            name="speedTick"
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
        </FieldSet>
      </CardContent>
    </Card>
  );
}
