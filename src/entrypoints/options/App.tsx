// SPDX-License-Identifier: GPL-3.0-only

import { AlertCircleIcon } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Toaster } from '@/components/ui/sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { t } from '@/i18n/t';
import { AllSitesAccessCard } from './AllSitesAccessCard';
import { BackupSettingsCards } from './BackupSettingsCards';
import { HotkeysSettingsCard } from './HotkeysSettingsCard';
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
    sliderPreview,
    drafts,
    updateDraft,
    behavior,
    hotkeys,
    speed,
    delaySeconds,
    policy,
    overlayLocked,
    delayLocked,
    resetBadgeText,
    mutate,
    mutateHotkey,
    adjustDisplayedSpeed,
    selectSite,
    selectPane,
    deleteSite,
    resetDefaults,
    resetAll,
    exportBackup,
    importBackup,
    commitDecimal,
    commitDelay,
    setSliderPreview,
  } = settings;

  if (!ready || !snapshot || !behavior || !hotkeys || !policy) {
    return (
      <>
        <Toaster />
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t('settingsLoadError')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <p>{t('settingsLoading')}</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="@container mx-auto flex min-h-svh w-full max-w-screen-xl flex-col">
      <Toaster />
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
              <AllSitesAccessCard />
              <BackupSettingsCards
                pending={pending}
                onExport={() => {
                  void exportBackup();
                }}
                onImport={importBackup}
              />
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
                  onAdjustSpeed={adjustDisplayedSpeed}
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
                <HotkeysSettingsCard
                  selection={selection}
                  hotkeys={hotkeys}
                  globalHotkeys={snapshot.globalHotkeys}
                  pending={pending}
                  resetBadgeText={resetBadgeText}
                  onMutate={mutateHotkey}
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
        </main>
      </div>
    </div>
  );
}
