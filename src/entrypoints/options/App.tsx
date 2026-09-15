// SPDX-License-Identifier: GPL-3.0-only

import { AlertCircleIcon, Trash2Icon } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { t } from '@/i18n/t';
import { AllSitesAccessCard } from './AllSitesAccessCard';
import { BackupSettingsCards } from './BackupSettingsCards';
import { HotkeysSettingsCard } from './HotkeysSettingsCard';
import { NavigationSettingsCard } from './NavigationSettingsCard';
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
    flashDelaySeconds,
    hotkeyRepeatDelaySeconds,
    policy,
    overlayLocked,
    delayLocked,
    flashLocked,
    hotkeyRepeatLocked,
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
    commitFlashDelay,
    commitHotkeyRepeatDelay,
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

  const paneAction =
    selection.kind === 'site'
      ? {
          label: t('deleteSiteSettings'),
          description: t('deleteSiteConfirm'),
          confirm: t('confirmDelete'),
          onConfirm: () => {
            void deleteSite(selection.hostname);
          },
        }
      : selection.kind === 'global'
        ? {
            label: t('resetDefaults'),
            description: t('resetDefaultsConfirm'),
            confirm: t('confirmReset'),
            onConfirm: () => {
              void resetDefaults();
            },
          }
        : null;

  return (
    <>
      <Toaster />
      <div className="flex h-full w-full justify-center overflow-hidden overscroll-none">
        <div className="flex h-full w-full min-w-0 max-w-md flex-col overflow-hidden md:w-fit md:max-w-none">
          <header className="flex shrink-0 items-center justify-between gap-3 p-3">
            <h1 className="text-sm font-semibold">{t('popupTitle')}</h1>
            <ModeToggle />
          </header>
          <Separator className="shrink-0" />
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[auto_auto] md:grid-rows-none">
            <SettingsSidebar
              selection={selection}
              customSites={customSites}
              pending={pending}
              onSelectPane={selectPane}
              onSelectSite={(hostname) => {
                void selectSite(hostname);
              }}
            />

            <main className="min-h-0 min-w-0 w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-none md:min-w-md md:shrink-0 p-6">
              <div className="flex w-full flex-col gap-6">
                {selection.kind === 'settings' ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <h2 className="text-lg font-semibold">{t('settingsTitle')}</h2>
                      <p className="text-sm text-muted-foreground">
                        {t('settingsPageDescription')}
                      </p>
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
                        <DialogTrigger>
                          <Button type="button" variant="destructive" isDisabled={pending}>
                            {t('resetAllSettings')}
                          </Button>
                          <Dialog showCloseButton={false}>
                            <DialogHeader>
                              <DialogTitle>{t('resetAllSettings')}</DialogTitle>
                              <DialogDescription>{t('resetAllConfirm')}</DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose variant="outline">{t('cancel')}</DialogClose>
                              <DialogClose
                                variant="destructive"
                                onPress={() => {
                                  void resetAll();
                                }}
                              >
                                {t('confirmReset')}
                              </DialogClose>
                            </DialogFooter>
                          </Dialog>
                        </DialogTrigger>
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
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">
                          {selection.kind === 'site' ? selection.hostname : t('settingsDefaults')}
                        </h2>
                        {paneAction ? (
                          <DialogTrigger>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              aria-label={paneAction.label}
                              isDisabled={pending}
                            >
                              <Trash2Icon />
                            </Button>
                            <Dialog showCloseButton={false}>
                              <DialogHeader>
                                <DialogTitle>{paneAction.label}</DialogTitle>
                                <DialogDescription>{paneAction.description}</DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <DialogClose variant="outline">{t('cancel')}</DialogClose>
                                <DialogClose variant="destructive" onPress={paneAction.onConfirm}>
                                  {paneAction.confirm}
                                </DialogClose>
                              </DialogFooter>
                            </Dialog>
                          </DialogTrigger>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selection.kind === 'site'
                          ? t('settingsSiteDescription')
                          : t('settingsDefaultsDescription')}
                      </p>
                    </div>

                    <Tabs defaultSelectedKey="playback" className="w-full min-w-0">
                      <TabsList
                        className="w-full max-w-full overflow-x-auto"
                        aria-label={
                          selection.kind === 'site' ? t('settingsSite') : t('settingsDefaults')
                        }
                      >
                        <TabsTrigger id="playback">{t('settingsPlayback')}</TabsTrigger>
                        <TabsTrigger id="overlay">{t('settingsOverlay')}</TabsTrigger>
                        <TabsTrigger id="navigation">{t('settingsNavigation')}</TabsTrigger>
                        <TabsTrigger id="hotkeys">{t('settingsHotkeys')}</TabsTrigger>
                      </TabsList>
                      <TabsContent id="playback">
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
                      </TabsContent>
                      <TabsContent id="overlay">
                        <OverlaySettingsCard
                          selection={selection}
                          behavior={behavior}
                          drafts={drafts}
                          delaySeconds={delaySeconds}
                          flashDelaySeconds={flashDelaySeconds}
                          pending={pending}
                          overlayLocked={overlayLocked}
                          delayLocked={delayLocked}
                          flashLocked={flashLocked}
                          resetBadgeText={resetBadgeText}
                          onMutate={(change) => {
                            void mutate(change);
                          }}
                          onDraftChange={(key, value) => {
                            updateDraft(key, value);
                          }}
                          onCommitDelay={commitDelay}
                          onCommitFlashDelay={commitFlashDelay}
                        />
                      </TabsContent>
                      <TabsContent id="navigation">
                        <NavigationSettingsCard
                          selection={selection}
                          behavior={behavior}
                          drafts={drafts}
                          pending={pending}
                          resetBadgeText={resetBadgeText}
                          onMutate={(change) => {
                            void mutate(change);
                          }}
                          onDraftChange={updateDraft}
                          onCommitDecimal={commitDecimal}
                        />
                      </TabsContent>
                      <TabsContent id="hotkeys">
                        <HotkeysSettingsCard
                          selection={selection}
                          behavior={behavior}
                          hotkeys={hotkeys}
                          drafts={drafts}
                          hotkeyRepeatDelaySeconds={hotkeyRepeatDelaySeconds}
                          pending={pending}
                          hotkeyRepeatLocked={hotkeyRepeatLocked}
                          resetBadgeText={resetBadgeText}
                          onMutate={mutateHotkey}
                          onMutateBehavior={(change) => {
                            void mutate(change);
                          }}
                          onDraftChange={(key, value) => {
                            updateDraft(key, value);
                          }}
                          onCommitHotkeyRepeatDelay={commitHotkeyRepeatDelay}
                        />
                      </TabsContent>
                    </Tabs>
                  </form>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
