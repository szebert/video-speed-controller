// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from 'react';
import { Trash2Icon, XIcon } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { ResetBadge } from '@/components/ResetBadge';
import { SpeedControls } from '@/components/SpeedControls';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { RadioButton, RadioField, RadioGroup } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type {
  BehaviorSettingsSnapshot,
  GetBehaviorSettingsResponse,
  SetBehaviorSettingResponse,
} from '../../core/messages';
import {
  SPEED_MAX_SETTING_MAX,
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MAX,
  SPEED_MIN_SETTING_MIN,
  SPEED_TICK_SETTING_MAX,
  SPEED_TICK_SETTING_MIN,
  adjustSpeed,
  clampPolicyNumber,
} from '../../core/speed';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import {
  canonicalizeOverlayAutoHideDelayMs,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  OVERLAY_POSITION,
  speedPolicyFromResolved,
  type BehaviorSettingChange,
  type EditableResolvedBehavior,
  type OverlayPosition,
  type SettingSource,
} from '../../settings/site-behavior';
import { normalizeSiteHostname } from '../../settings/site-hostname';

type Selection = { kind: 'settings' } | { kind: 'global' } | { kind: 'site'; hostname: string };
type DraftKey = 'speedMin' | 'speedMax' | 'speedTick' | 'delay';
type OverlaySwitchFieldName =
  'overlayVisible' | 'overlayPositionButton' | 'overlaySettingsButton' | 'overlayAutoHide';

const POSITION_OPTIONS: { value: OverlayPosition; labelKey: Parameters<typeof t>[0] }[] = [
  { value: OVERLAY_POSITION.TOP_LEFT, labelKey: 'positionTopLeft' },
  { value: OVERLAY_POSITION.TOP_CENTER, labelKey: 'positionTopCenter' },
  { value: OVERLAY_POSITION.TOP_RIGHT, labelKey: 'positionTopRight' },
  { value: OVERLAY_POSITION.CENTER_LEFT, labelKey: 'positionCenterLeft' },
  { value: OVERLAY_POSITION.CENTER, labelKey: 'positionCenter' },
  { value: OVERLAY_POSITION.CENTER_RIGHT, labelKey: 'positionCenterRight' },
  { value: OVERLAY_POSITION.BOTTOM_LEFT, labelKey: 'positionBottomLeft' },
  { value: OVERLAY_POSITION.BOTTOM_CENTER, labelKey: 'positionBottomCenter' },
  { value: OVERLAY_POSITION.BOTTOM_RIGHT, labelKey: 'positionBottomRight' },
];

function focusedHostnameFromLocation(): string | null {
  return normalizeSiteHostname(new URL(window.location.href).searchParams.get('site'));
}

function ownsOverride(selection: Selection, source: SettingSource): boolean {
  return (
    (selection.kind === 'global' && source === 'global') ||
    (selection.kind === 'site' && source === 'site')
  );
}

function resetFieldLabel(fieldLabel: string): string {
  return `${t('reset')}: ${fieldLabel}`;
}

function showsInherited(selection: Selection, source: SettingSource, draft?: string): boolean {
  return !ownsOverride(selection, source) && draft == null;
}

function OverlaySwitchField({
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
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={helpId}>{description}</FieldDescription>
      </FieldContent>
      <div className="flex items-center gap-2">
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

function InputGroupInheritReset({
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

function currentBehavior(
  snapshot: BehaviorSettingsSnapshot,
  selection: Selection,
): EditableResolvedBehavior {
  if (selection.kind === 'site' && snapshot.site?.hostname === selection.hostname) {
    return snapshot.site.behavior;
  }
  return snapshot.global;
}

async function requestGet(hostname: string | null): Promise<GetBehaviorSettingsResponse> {
  const message =
    hostname == null
      ? { type: 'GET_BEHAVIOR_SETTINGS' as const }
      : { type: 'GET_BEHAVIOR_SETTINGS' as const, hostname };
  return (await chrome.runtime.sendMessage(message)) as GetBehaviorSettingsResponse;
}

export function App() {
  const pageHostname = useMemo(() => focusedHostnameFromLocation(), []);
  const [selection, setSelection] = useState<Selection>(
    pageHostname ? { kind: 'site', hostname: pageHostname } : { kind: 'global' },
  );
  const [snapshot, setSnapshot] = useState<BehaviorSettingsSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({});

  const snapshotHostname = selection.kind === 'site' ? selection.hostname : pageHostname;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await requestGet(pageHostname);
        if (cancelled) {
          return;
        }
        if (response.ok) {
          setSnapshot(response.state);
        } else {
          setError(response.error);
        }
      } catch {
        if (!cancelled) {
          setError(t('settingsSaveError'));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageHostname]);

  const behavior = snapshot ? currentBehavior(snapshot, selection) : null;
  const overlayEnabled = behavior?.overlayVisible.value ?? true;

  function applyResponse(response: SetBehaviorSettingResponse | undefined): boolean {
    if (!response) {
      setError(t('settingsSaveError'));
      return false;
    }
    if (!response.ok) {
      setError(response.error || t('settingsSaveError'));
      return false;
    }
    if (response.reapplyFailures > 0 || response.reapplyError) {
      setWarning(t('settingsReapplyError'));
    }
    if (response.state) {
      setSnapshot(response.state);
      setDrafts({});
      setSliderPreview(null);
      return true;
    }
    setWarning(t('settingsRefreshError'));
    return true;
  }

  async function recover(): Promise<void> {
    const recovered = await requestGet(snapshotHostname).catch(() => null);
    if (recovered?.ok) {
      setSnapshot(recovered.state);
      setDrafts({});
      setSliderPreview(null);
    }
  }

  async function sendPrivileged(
    message: Record<string, unknown>,
  ): Promise<SetBehaviorSettingResponse | undefined> {
    return (await chrome.runtime.sendMessage({
      ...message,
      ...(snapshotHostname ? { snapshotHostname } : {}),
    })) as SetBehaviorSettingResponse | undefined;
  }

  async function mutate(change: BehaviorSettingChange): Promise<void> {
    if (!snapshot || pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({
        type: 'SET_BEHAVIOR_SETTING',
        scope:
          selection.kind === 'site'
            ? { kind: 'site', hostname: selection.hostname }
            : { kind: 'global' },
        change,
      });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover();
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  async function selectSite(hostname: string): Promise<void> {
    setDrafts({});
    setSliderPreview(null);
    if (snapshot?.site?.hostname === hostname) {
      setSelection({ kind: 'site', hostname });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await requestGet(hostname);
      if (response.ok) {
        setSnapshot(response.state);
        setSelection({ kind: 'site', hostname });
      } else {
        setError(response.error);
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  async function resetDefaults(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({ type: 'RESET_GLOBAL_BEHAVIOR' });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover();
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  async function resetAll(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({ type: 'RESET_ALL_BEHAVIOR' });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover();
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  function selectPane(next: Selection): void {
    setSelection(next);
    setDrafts({});
    setSliderPreview(null);
  }

  async function deleteSite(hostname: string): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({ type: 'DELETE_SITE_SETTINGS', hostname });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover();
        return;
      }
      if (selection.kind === 'site' && selection.hostname === hostname) {
        setSelection({ kind: 'global' });
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  if (!ready || !snapshot || !behavior) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <p>{t('settingsLoading')}</p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const speed = sliderPreview ?? behavior.speed.value;
  const delaySeconds = String(behavior.overlayAutoHideDelayMs.value / 1000);
  const customSites = snapshot.customSites;
  const policy = speedPolicyFromResolved(behavior);
  const overlayLocked = pending || !overlayEnabled;
  const delayLocked = overlayLocked || !behavior.overlayAutoHide.value;
  const resetBadgeText = selection.kind === 'site' ? t('settingOverride') : t('settingCustom');

  function clearDraft(key: DraftKey): void {
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function commitDecimal(
    key: Exclude<DraftKey, 'delay'>,
    fallback: number,
    min: number,
    max: number,
  ): void {
    const raw = drafts[key] ?? String(fallback);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      clearDraft(key);
      return;
    }
    void mutate({
      kind: 'value',
      field: key,
      value: clampPolicyNumber(parsed, min, max),
    });
  }

  const commitDelay = () => {
    const seconds = Number(drafts.delay ?? delaySeconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      clearDraft('delay');
      return;
    }
    void mutate({
      kind: 'value',
      field: 'overlayAutoHideDelayMs',
      value: canonicalizeOverlayAutoHideDelayMs(seconds * 1000),
    });
  };

  return (
    <div className="@container mx-auto flex min-h-svh w-full max-w-screen-xl flex-col">
      <header className="flex items-center justify-between gap-3 p-3">
        <h1 className="text-sm font-semibold">{t('popupTitle')}</h1>
        <ModeToggle />
      </header>
      <Separator />
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] @3xl:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)] @3xl:grid-rows-none">
        <aside className="flex min-h-0 min-w-0 flex-col border-b @3xl:h-full @3xl:border-b-0 @3xl:border-e">
          <nav
            aria-label={t('settingsTitle')}
            className="flex min-h-0 flex-col gap-3 p-3 @3xl:flex-1"
          >
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                size="sm"
                variant={selection.kind === 'settings' ? 'default' : 'outline'}
                aria-current={selection.kind === 'settings' ? 'page' : undefined}
                isDisabled={pending}
                className="justify-start"
                onPress={() => {
                  selectPane({ kind: 'settings' });
                }}
              >
                {t('settingsTitle')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selection.kind === 'global' ? 'default' : 'outline'}
                aria-current={selection.kind === 'global' ? 'page' : undefined}
                isDisabled={pending}
                className="justify-start"
                onPress={() => {
                  selectPane({ kind: 'global' });
                }}
              >
                {t('settingsDefaults')}
              </Button>
            </div>
            <Separator />
            <div className="flex min-h-0 flex-col gap-2 @3xl:flex-1">
              <p className="px-2 text-xs font-medium text-muted-foreground">{t('settingsSites')}</p>
              <div className="max-h-48 min-h-0 overflow-y-auto @3xl:max-h-none @3xl:flex-1">
                {customSites.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">{t('settingsNoSites')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {customSites.map((hostname) => {
                      const selected = selection.kind === 'site' && selection.hostname === hostname;
                      return (
                        <li key={hostname} className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={pending}
                            aria-current={selected ? 'page' : undefined}
                            className={cn(
                              buttonVariants({
                                size: 'sm',
                                variant: selected ? 'default' : 'ghost',
                              }),
                              'min-w-0 flex-1 justify-start',
                            )}
                            onClick={() => {
                              void selectSite(hostname);
                            }}
                          >
                            <span className="truncate">{hostname}</span>
                          </button>
                          <AlertDialogTrigger>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${t('deleteSiteSettings')}: ${hostname}`}
                              isDisabled={pending}
                            >
                              <Trash2Icon />
                            </Button>
                            <AlertDialog>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('deleteSiteSettings')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('deleteSiteConfirm')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onPress={() => {
                                    void deleteSite(hostname);
                                  }}
                                >
                                  {t('confirmDelete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialog>
                          </AlertDialogTrigger>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </nav>
        </aside>

        <main className="flex min-w-0 flex-col gap-6 overflow-y-auto p-6">
          {selection.kind === 'settings' ? (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">{t('settingsTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('settingsPageDescription')}</p>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>{t('resetAllSettings')}</CardTitle>
                  <CardDescription>{t('restoreSettingsToDefaults')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AlertDialogTrigger>
                    <Button type="button" variant="destructive" isDisabled={pending}>
                      {t('resetAllSettings')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('resetAllSettings')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('resetAllConfirm')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onPress={() => {
                            void resetAll();
                          }}
                        >
                          {t('confirmReset')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialog>
                  </AlertDialogTrigger>
                </CardContent>
              </Card>
            </>
          ) : (
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">
                  {selection.kind === 'site' ? selection.hostname : t('settingsDefaults')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selection.kind === 'site'
                    ? t('settingsSiteDescription')
                    : t('settingsDefaultsDescription')}
                </p>
              </div>

              <FieldGroup>
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
                        disabled={pending}
                        resetDisabled={!ownsOverride(selection, behavior.speed.source)}
                        muted={
                          showsInherited(selection, behavior.speed.source) && sliderPreview == null
                        }
                        policy={policy}
                        onAdjust={(direction) => {
                          void mutate({
                            kind: 'value',
                            field: 'speed',
                            value: adjustSpeed(behavior.speed.value, direction, policy),
                          });
                        }}
                        onReset={() => {
                          void mutate({ kind: 'inherit', field: 'speed' });
                        }}
                        onPreviewSlider={setSliderPreview}
                        onCommitSlider={(value) => {
                          void mutate({ kind: 'value', field: 'speed', value });
                        }}
                      />
                      <FieldGroup className="grid grid-cols-1 gap-4 @xl/field-group:grid-cols-3">
                        <Field>
                          <FieldLabel htmlFor="speed-min">{t('speedMin')}</FieldLabel>
                          <InputGroup isDisabled={pending}>
                            <InputGroupInput
                              id="speed-min"
                              className={cn(
                                showsInherited(
                                  selection,
                                  behavior.speedMin.source,
                                  drafts.speedMin,
                                ) && 'text-muted-foreground',
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
                                setDrafts((current) => ({
                                  ...current,
                                  speedMin: event.target.value,
                                }));
                              }}
                              onBlur={() => {
                                commitDecimal(
                                  'speedMin',
                                  behavior.speedMin.value,
                                  SPEED_MIN_SETTING_MIN,
                                  SPEED_MIN_SETTING_MAX,
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitDecimal(
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
                                void mutate({ kind: 'inherit', field: 'speedMin' });
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
                                showsInherited(
                                  selection,
                                  behavior.speedTick.source,
                                  drafts.speedTick,
                                ) && 'text-muted-foreground',
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
                                setDrafts((current) => ({
                                  ...current,
                                  speedTick: event.target.value,
                                }));
                              }}
                              onBlur={() => {
                                commitDecimal(
                                  'speedTick',
                                  behavior.speedTick.value,
                                  SPEED_TICK_SETTING_MIN,
                                  SPEED_TICK_SETTING_MAX,
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitDecimal(
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
                                void mutate({ kind: 'inherit', field: 'speedTick' });
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
                                showsInherited(
                                  selection,
                                  behavior.speedMax.source,
                                  drafts.speedMax,
                                ) && 'text-muted-foreground',
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
                                setDrafts((current) => ({
                                  ...current,
                                  speedMax: event.target.value,
                                }));
                              }}
                              onBlur={() => {
                                commitDecimal(
                                  'speedMax',
                                  behavior.speedMax.value,
                                  SPEED_MAX_SETTING_MIN,
                                  SPEED_MAX_SETTING_MAX,
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitDecimal(
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
                                void mutate({ kind: 'inherit', field: 'speedMax' });
                              }}
                            />
                          </InputGroup>
                          <FieldDescription>{t('speedMaxDescription')}</FieldDescription>
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                  </CardContent>
                </Card>

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
                        onMutate={(change) => {
                          void mutate(change);
                        }}
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
                              void mutate({ kind: 'inherit', field: 'overlayPosition' });
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
                            void mutate({
                              kind: 'value',
                              field: 'overlayPosition',
                              value: Number(value) as OverlayPosition,
                            });
                          }}
                        >
                          {POSITION_OPTIONS.map((option) => (
                            <RadioField
                              key={option.value}
                              value={String(option.value)}
                              className="contents"
                            >
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
                          onMutate={(change) => {
                            void mutate(change);
                          }}
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
                          onMutate={(change) => {
                            void mutate(change);
                          }}
                        />
                      </FieldGroup>
                      <FieldGroup className="grid grid-cols-1 gap-4 @md/field-group:grid-cols-2">
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
                          onMutate={(change) => {
                            void mutate(change);
                          }}
                        />
                        <Field data-disabled={delayLocked || undefined}>
                          <FieldLabel htmlFor="overlay-auto-hide-delay">
                            {t('overlayAutoHideDelay')}
                          </FieldLabel>
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
                                setDrafts((current) => ({ ...current, delay: event.target.value }));
                              }}
                              onBlur={commitDelay}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitDelay();
                                }
                              }}
                            />
                            <InputGroupInheritReset
                              active={ownsOverride(
                                selection,
                                behavior.overlayAutoHideDelayMs.source,
                              )}
                              disabled={delayLocked}
                              label={resetFieldLabel(t('overlayAutoHideDelay'))}
                              onReset={() => {
                                void mutate({ kind: 'inherit', field: 'overlayAutoHideDelayMs' });
                              }}
                            />
                          </InputGroup>
                          <FieldDescription id="overlay-auto-hide-delay-help">
                            {t('overlayAutoHideDelayDescription')}
                          </FieldDescription>
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                  </CardContent>
                </Card>
              </FieldGroup>

              {selection.kind === 'global' ? (
                <Button
                  type="button"
                  variant="outline"
                  isDisabled={pending}
                  onPress={() => {
                    void resetDefaults();
                  }}
                >
                  {t('resetDefaults')}
                </Button>
              ) : null}
            </form>
          )}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {warning ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {warning}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
