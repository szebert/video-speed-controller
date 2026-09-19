// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import { ResetBadge } from '@/components/ResetBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldWarning,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { readKeyboardLayoutMap } from '../../core/hotkey-format';
import { t, type MessageKey } from '@/i18n/t';
import { cn } from 'cn';
import type { HotkeyBinding } from '../../settings/hotkey-binding';
import {
  canonicalizeHotkeyRepeatRate,
  findSameSourceHotkeyConflict,
  findShadowedHotkey,
  HOTKEY_REPEAT_DELAY_MS_MAX,
  HOTKEY_REPEAT_DELAY_MS_MIN,
  HOTKEY_REPEAT_RATE_MAX,
  HOTKEY_REPEAT_RATE_MIN,
  type BehaviorSettingChange,
  type EditableResolvedBehavior,
  type HotkeySettingChange,
  type ResolvedHotkeyMap,
  type SiteHotkeyAction,
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
import { ShortcutRecorder } from './ShortcutRecorder';

type HotkeyRow = {
  action: SiteHotkeyAction;
  label: MessageKey;
  description: MessageKey;
};

const HOTKEY_ROWS: readonly HotkeyRow[] = [
  {
    action: 'decreaseSpeed',
    label: 'hotkeyDecreaseSpeed',
    description: 'hotkeyDecreaseSpeedDescription',
  },
  {
    action: 'increaseSpeed',
    label: 'hotkeyIncreaseSpeed',
    description: 'hotkeyIncreaseSpeedDescription',
  },
  {
    action: 'resetSpeed',
    label: 'hotkeyResetSpeed',
    description: 'hotkeyResetSpeedDescription',
  },
  {
    action: 'jumpToStart',
    label: 'hotkeyJumpToStart',
    description: 'hotkeyJumpToStartDescription',
  },
  {
    action: 'rewind',
    label: 'hotkeyRewind',
    description: 'hotkeyRewindDescription',
  },
  {
    action: 'skipBack',
    label: 'hotkeySkipBack',
    description: 'hotkeySkipBackDescription',
  },
  {
    action: 'playPause',
    label: 'hotkeyPlayPause',
    description: 'hotkeyPlayPauseDescription',
  },
  {
    action: 'skipForward',
    label: 'hotkeySkipForward',
    description: 'hotkeySkipForwardDescription',
  },
  {
    action: 'fastForward',
    label: 'hotkeyFastForward',
    description: 'hotkeyFastForwardDescription',
  },
  {
    action: 'jumpToEnd',
    label: 'hotkeyJumpToEnd',
    description: 'hotkeyJumpToEndDescription',
  },
];

const ACTION_LABEL: Record<SiteHotkeyAction, MessageKey> = {
  decreaseSpeed: 'hotkeyDecreaseSpeed',
  increaseSpeed: 'hotkeyIncreaseSpeed',
  resetSpeed: 'hotkeyResetSpeed',
  jumpToStart: 'hotkeyJumpToStart',
  rewind: 'hotkeyRewind',
  skipBack: 'hotkeySkipBack',
  playPause: 'hotkeyPlayPause',
  skipForward: 'hotkeySkipForward',
  fastForward: 'hotkeyFastForward',
  jumpToEnd: 'hotkeyJumpToEnd',
};

export function hotkeyConflictMessage(action: SiteHotkeyAction): string {
  return `${t('hotkeyAlreadyUsed')} ${t(ACTION_LABEL[action])}.`;
}

export function hotkeyShadowedMessage(action: SiteHotkeyAction): string {
  return `${t('hotkeyShadowed')} ${t(ACTION_LABEL[action])}.`;
}

export function HotkeysSettingsCard({
  selection,
  behavior,
  hotkeys,
  drafts,
  hotkeyRepeatDelaySeconds,
  pending,
  hotkeyRepeatLocked,
  resetBadgeText,
  onMutate,
  onMutateBehavior,
  onDraftChange,
  onCommitHotkeyRepeatDelay,
}: {
  selection: Selection;
  behavior: EditableResolvedBehavior;
  hotkeys: ResolvedHotkeyMap;
  drafts: Partial<Record<DraftKey, string>>;
  hotkeyRepeatDelaySeconds: string;
  pending: boolean;
  hotkeyRepeatLocked: boolean;
  resetBadgeText: string;
  onMutate: (change: HotkeySettingChange) => void;
  onMutateBehavior: (change: BehaviorSettingChange) => void;
  onDraftChange: (key: 'hotkeyRepeatDelay', value: string) => void;
  onCommitHotkeyRepeatDelay: () => void;
}) {
  const [layoutMap, setLayoutMap] = useState<ReadonlyMap<string, string> | undefined>();
  const [recordingAction, setRecordingAction] = useState<SiteHotkeyAction | null>(null);
  const [conflictAction, setConflictAction] = useState<Partial<Record<SiteHotkeyAction, string>>>(
    {},
  );
  const [takeoverAction, setTakeoverAction] = useState<SiteHotkeyAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readKeyboardLayoutMap().then((map) => {
      if (!cancelled) {
        setLayoutMap(map);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function clearRowStatus(action: SiteHotkeyAction): void {
    setConflictAction((current) => {
      if (!(action in current)) {
        return current;
      }
      const next = { ...current };
      delete next[action];
      return next;
    });
    setTakeoverAction((current) => (current === action ? null : current));
  }

  function writeSource(): 'site' | 'global' {
    return selection.kind === 'site' ? 'site' : 'global';
  }

  function assign(action: SiteHotkeyAction, binding: HotkeyBinding): void {
    const conflict = findSameSourceHotkeyConflict(hotkeys, action, binding, writeSource());
    if (conflict) {
      setConflictAction((current) => ({ ...current, [action]: hotkeyConflictMessage(conflict) }));
      setTakeoverAction((current) => (current === action ? null : current));
      return;
    }
    clearRowStatus(action);
    onMutate({ kind: 'hotkey-value', action, value: binding });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsHotkeys')}</CardTitle>
        <CardDescription>{t('settingsHotkeysDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">{t('settingsHotkeys')}</FieldLegend>
          <FieldGroup className={OPTIONS_FIELD_GRID}>
            <BehaviorSwitchField
              id="hotkey-repeat"
              className={OPTIONS_FIELD_SPAN}
              name="hotkeyRepeat"
              field="hotkeyRepeat"
              label={t('hotkeyRepeat')}
              description={t('hotkeyRepeatDescription')}
              setting={behavior.hotkeyRepeat}
              selection={selection}
              disabled={pending}
              resetBadgeText={resetBadgeText}
              onMutate={onMutateBehavior}
            />
            <OptionsNumberField
              id="hotkey-repeat-delay"
              name="hotkeyRepeatDelay"
              label={t('hotkeyRepeatDelay')}
              description={t('hotkeyRepeatDelayDescription')}
              min={HOTKEY_REPEAT_DELAY_MS_MIN / 1000}
              max={HOTKEY_REPEAT_DELAY_MS_MAX / 1000}
              step={0.1}
              value={drafts.hotkeyRepeatDelay ?? hotkeyRepeatDelaySeconds}
              disabled={hotkeyRepeatLocked}
              muted={showsInherited(
                selection,
                behavior.hotkeyRepeatDelayMs.source,
                drafts.hotkeyRepeatDelay,
              )}
              resetActive={ownsOverride(selection, behavior.hotkeyRepeatDelayMs.source)}
              resetLabel={resetFieldLabel(t('hotkeyRepeatDelay'))}
              onDraftChange={(value) => {
                onDraftChange('hotkeyRepeatDelay', value);
              }}
              onCommit={onCommitHotkeyRepeatDelay}
              onReset={() => {
                onMutateBehavior({ kind: 'inherit', field: 'hotkeyRepeatDelayMs' });
              }}
            />
            <Field data-disabled={hotkeyRepeatLocked || undefined}>
              <div className="flex items-start justify-between gap-2">
                <FieldContent>
                  <FieldLabel id="hotkey-repeat-rate-label">{t('hotkeyRepeatRate')}</FieldLabel>
                  <FieldDescription id="hotkey-repeat-rate-help">
                    {t('hotkeyRepeatRateDescription')}
                  </FieldDescription>
                </FieldContent>
                <ResetBadge
                  active={ownsOverride(selection, behavior.hotkeyRepeatRate.source)}
                  disabled={hotkeyRepeatLocked}
                  text={resetBadgeText}
                  label={resetFieldLabel(t('hotkeyRepeatRate'))}
                  onReset={() => {
                    onMutateBehavior({ kind: 'inherit', field: 'hotkeyRepeatRate' });
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  aria-label={t('hotkeyRepeatRate')}
                  aria-labelledby="hotkey-repeat-rate-label"
                  aria-describedby="hotkey-repeat-rate-help"
                  isDisabled={hotkeyRepeatLocked}
                  minValue={HOTKEY_REPEAT_RATE_MIN}
                  maxValue={HOTKEY_REPEAT_RATE_MAX}
                  step={0.5}
                  value={behavior.hotkeyRepeatRate.value}
                  onChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (next == null) {
                      return;
                    }
                    onMutateBehavior({
                      kind: 'value',
                      field: 'hotkeyRepeatRate',
                      value: canonicalizeHotkeyRepeatRate(next),
                    });
                  }}
                />
                <span
                  className={cn(
                    'w-14 shrink-0 text-right text-sm tabular-nums',
                    showsInherited(selection, behavior.hotkeyRepeatRate.source) &&
                      'text-muted-foreground',
                  )}
                >
                  {`${behavior.hotkeyRepeatRate.value}/sec`}
                </span>
              </div>
            </Field>
            {HOTKEY_ROWS.map((row) => {
              const setting = hotkeys[row.action];
              const label = t(row.label);
              const inherited = showsInherited(selection, setting.source);
              const conflict = conflictAction[row.action];
              const shadowedBy = findShadowedHotkey(hotkeys, row.action);
              const takeover = takeoverAction === row.action;
              const helpId = `hotkey-${row.action}-help`;
              return (
                <Field
                  key={row.action}
                  orientation="horizontal"
                  className={cn('min-w-0', OPTIONS_FIELD_SPAN)}
                  data-disabled={pending || undefined}
                  data-invalid={conflict ? true : undefined}
                  data-warning={!conflict && (shadowedBy || takeover) ? true : undefined}
                >
                  <FieldContent className="min-w-0 flex-[1_1_12rem]">
                    <FieldLabel htmlFor={`hotkey-${row.action}`}>{label}</FieldLabel>
                    <FieldDescription id={helpId}>{t(row.description)}</FieldDescription>
                    {conflict ? <FieldError>{conflict}</FieldError> : null}
                    {!conflict && shadowedBy ? (
                      <FieldWarning>{hotkeyShadowedMessage(shadowedBy)}</FieldWarning>
                    ) : null}
                    {takeover && !conflict && !shadowedBy ? (
                      <FieldWarning>{t('hotkeyBrowserTookShortcut')}</FieldWarning>
                    ) : null}
                  </FieldContent>
                  <div className="flex max-w-full flex-wrap-reverse items-center justify-end gap-2">
                    <ResetBadge
                      active={ownsOverride(selection, setting.source)}
                      disabled={pending}
                      text={resetBadgeText}
                      label={resetFieldLabel(label)}
                      onReset={() => {
                        clearRowStatus(row.action);
                        onMutate({ kind: 'hotkey-inherit', action: row.action });
                      }}
                    />
                    <ShortcutRecorder
                      id={`hotkey-${row.action}`}
                      label={label}
                      binding={setting.value}
                      muted={inherited}
                      disabled={pending}
                      recording={recordingAction === row.action}
                      layoutMap={layoutMap}
                      onRecordingChange={(next) => {
                        if (next) {
                          clearRowStatus(row.action);
                          setRecordingAction(row.action);
                          return;
                        }
                        setRecordingAction((current) => (current === row.action ? null : current));
                      }}
                      onAssign={(binding) => {
                        assign(row.action, binding);
                      }}
                      onUnbind={() => {
                        clearRowStatus(row.action);
                        onMutate({ kind: 'hotkey-value', action: row.action, value: null });
                      }}
                      onCancel={() => {
                        clearRowStatus(row.action);
                      }}
                      onBrowserTookShortcut={() => {
                        setConflictAction((current) => {
                          if (!(row.action in current)) {
                            return current;
                          }
                          const next = { ...current };
                          delete next[row.action];
                          return next;
                        });
                        setTakeoverAction(row.action);
                      }}
                    />
                  </div>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
