// SPDX-License-Identifier: GPL-3.0-only

import { ModeToggle } from '@/components/mode-toggle';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { t } from '@/i18n/t';
import { OverlaySettingsCard } from './OverlaySettingsCard';
import { PlaybackSettingsCard } from './PlaybackSettingsCard';
import { SettingsSidebar } from './SettingsSidebar';
import { useBehaviorSettings } from './useBehaviorSettings';

export function App() {
  const settings = useBehaviorSettings();
  const {
    selection,
    snapshot,
    customSites,
    ready,
    pending,
    error,
    warning,
    sliderPreview,
    drafts,
    updateDraft,
    behavior,
    speed,
    delaySeconds,
    policy,
    overlayLocked,
    delayLocked,
    resetBadgeText,
    mutate,
    selectSite,
    selectPane,
    deleteSite,
    resetDefaults,
    resetAll,
    commitDecimal,
    commitDelay,
    setSliderPreview,
  } = settings;

  if (!ready || !snapshot || !behavior || !policy) {
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

  return (
    <div className="@container mx-auto flex min-h-svh w-full max-w-screen-xl flex-col">
      <header className="flex items-center justify-between gap-3 p-3">
        <h1 className="text-sm font-semibold">{t('popupTitle')}</h1>
        <ModeToggle />
      </header>
      <Separator />
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] @3xl:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)] @3xl:grid-rows-none">
        <SettingsSidebar
          selection={selection}
          customSites={customSites}
          pending={pending}
          onSelectPane={selectPane}
          onSelectSite={(hostname) => {
            void selectSite(hostname);
          }}
          onDeleteSite={(hostname) => {
            void deleteSite(hostname);
          }}
        />

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
                <PlaybackSettingsCard
                  selection={selection}
                  behavior={behavior}
                  speed={speed}
                  drafts={drafts}
                  pending={pending}
                  policy={policy}
                  sliderPreview={sliderPreview}
                  onMutate={(change) => {
                    void mutate(change);
                  }}
                  onPreviewSlider={setSliderPreview}
                  onDraftChange={updateDraft}
                  onCommitDecimal={commitDecimal}
                />
                <OverlaySettingsCard
                  selection={selection}
                  behavior={behavior}
                  drafts={drafts}
                  delaySeconds={delaySeconds}
                  pending={pending}
                  overlayLocked={overlayLocked}
                  delayLocked={delayLocked}
                  resetBadgeText={resetBadgeText}
                  onMutate={(change) => {
                    void mutate(change);
                  }}
                  onDraftChange={(value) => {
                    updateDraft('delay', value);
                  }}
                  onCommitDelay={commitDelay}
                />
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
