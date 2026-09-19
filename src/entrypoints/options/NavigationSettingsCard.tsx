// SPDX-License-Identifier: GPL-3.0-only

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { t } from '@/i18n/t';
import {
  SKIP_SECONDS_MAX,
  SKIP_SECONDS_MIN,
  TRANSPORT_RATE_MAGNITUDE_MAX,
  TRANSPORT_RATE_MAGNITUDE_MIN,
  type BehaviorSettingChange,
  type EditableResolvedBehavior,
} from '../../settings/site-behavior';
import {
  BehaviorSwitchField,
  OPTIONS_FIELD_GRID,
  OPTIONS_FIELD_SPAN,
  OptionsNumberField,
} from './options-fields';
import {
  ownsOverride,
  resetFieldLabel,
  showsInherited,
  type DraftKey,
  type Selection,
} from './options-model';

type NumberDraftKey = Exclude<DraftKey, 'delay' | 'flashDelay' | 'hotkeyRepeatDelay'>;

export function NavigationSettingsCard({
  selection,
  behavior,
  drafts,
  pending,
  resetBadgeText,
  onMutate,
  onDraftChange,
  onCommitDecimal,
}: {
  selection: Selection;
  behavior: EditableResolvedBehavior;
  drafts: Partial<Record<DraftKey, string>>;
  pending: boolean;
  resetBadgeText: string;
  onMutate: (change: BehaviorSettingChange) => void;
  onDraftChange: (key: NumberDraftKey, value: string) => void;
  onCommitDecimal: (key: NumberDraftKey, fallback: number, min: number, max: number) => void;
}) {
  function numberField(
    key: 'skipBackSeconds' | 'skipForwardSeconds' | 'fastForwardSpeed' | 'rewindSpeed',
    id: string,
    label: string,
    description: string,
    min: number,
    max: number,
    step: number,
  ) {
    const setting = behavior[key];
    const displayed =
      drafts[key] ?? String(key === 'rewindSpeed' ? Math.abs(setting.value) : setting.value);
    return (
      <OptionsNumberField
        id={id}
        name={key}
        label={label}
        description={description}
        min={min}
        max={max}
        step={step}
        value={displayed}
        disabled={pending}
        muted={showsInherited(selection, setting.source, drafts[key])}
        resetActive={ownsOverride(selection, setting.source)}
        resetLabel={resetFieldLabel(label)}
        onDraftChange={(value) => {
          onDraftChange(key, value);
        }}
        onCommit={() => {
          onCommitDecimal(key, setting.value, min, max);
        }}
        onReset={() => {
          onMutate({ kind: 'inherit', field: key });
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsNavigation')}</CardTitle>
        <CardDescription>{t('settingsNavigationDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">{t('settingsNavigation')}</FieldLegend>
          <FieldGroup className={OPTIONS_FIELD_GRID}>
            {numberField(
              'skipBackSeconds',
              'skip-back-seconds',
              t('skipBackSeconds'),
              t('skipBackSecondsDescription'),
              SKIP_SECONDS_MIN,
              SKIP_SECONDS_MAX,
              0.5,
            )}
            {numberField(
              'skipForwardSeconds',
              'skip-forward-seconds',
              t('skipForwardSeconds'),
              t('skipForwardSecondsDescription'),
              SKIP_SECONDS_MIN,
              SKIP_SECONDS_MAX,
              0.5,
            )}
            <BehaviorSwitchField
              id="skip-scale-with-playback-rate"
              name="skipScaleWithPlaybackRate"
              field="skipScaleWithPlaybackRate"
              label={t('skipScaleWithPlaybackRate')}
              description={t('skipScaleWithPlaybackRateDescription')}
              setting={behavior.skipScaleWithPlaybackRate}
              selection={selection}
              disabled={pending}
              resetBadgeText={resetBadgeText}
              className={OPTIONS_FIELD_SPAN}
              onMutate={onMutate}
            />
            {numberField(
              'fastForwardSpeed',
              'fast-forward-speed',
              t('fastForwardSpeed'),
              t('fastForwardSpeedDescription'),
              TRANSPORT_RATE_MAGNITUDE_MIN,
              TRANSPORT_RATE_MAGNITUDE_MAX,
              0.25,
            )}
            {numberField(
              'rewindSpeed',
              'rewind-speed',
              t('rewindSpeed'),
              t('rewindSpeedDescription'),
              TRANSPORT_RATE_MAGNITUDE_MIN,
              TRANSPORT_RATE_MAGNITUDE_MAX,
              0.25,
            )}
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
