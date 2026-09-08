// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import { ResetBadge } from '@/components/ResetBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldWarning,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { readKeyboardLayoutMap } from '../../core/hotkey-format';
import { t, type MessageKey } from '@/i18n/t';
import type { HotkeyBinding } from '../../settings/hotkey-binding';
import {
  findSameSourceHotkeyConflict,
  findShadowedHotkey,
  type HotkeySettingChange,
  type ResolvedHotkeyMap,
  type SiteHotkeyAction,
} from '../../settings/site-behavior';
import { ownsOverride, resetFieldLabel, showsInherited, type Selection } from './options-model';
import { ShortcutRecorder } from './ShortcutRecorder';

const HOTKEY_ROWS = [
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
] as const satisfies readonly {
  action: SiteHotkeyAction;
  label: MessageKey;
  description: MessageKey;
}[];

const ACTION_LABEL: Record<SiteHotkeyAction, MessageKey> = {
  decreaseSpeed: 'hotkeyDecreaseSpeed',
  increaseSpeed: 'hotkeyIncreaseSpeed',
  resetSpeed: 'hotkeyResetSpeed',
};

export function hotkeyConflictMessage(action: SiteHotkeyAction): string {
  return `${t('hotkeyAlreadyUsed')} ${t(ACTION_LABEL[action])}.`;
}

export function hotkeyShadowedMessage(action: SiteHotkeyAction): string {
  return `${t('hotkeyShadowed')} ${t(ACTION_LABEL[action])}.`;
}

export function HotkeysSettingsCard({
  selection,
  hotkeys,
  pending,
  resetBadgeText,
  onMutate,
}: {
  selection: Selection;
  hotkeys: ResolvedHotkeyMap;
  pending: boolean;
  resetBadgeText: string;
  onMutate: (change: HotkeySettingChange) => void;
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
                className="min-w-0"
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
        </FieldSet>
      </CardContent>
    </Card>
  );
}
