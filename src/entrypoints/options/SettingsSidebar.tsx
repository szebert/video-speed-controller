// SPDX-License-Identifier: GPL-3.0-only

import { useId, useLayoutEffect, useRef } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import type { Selection } from './options-model';

export function SettingsSidebar({
  selection,
  customSites,
  pending,
  onSelectPane,
  onSelectSite,
}: {
  selection: Selection;
  customSites: string[];
  pending: boolean;
  onSelectPane: (next: Selection) => void;
  onSelectSite: (hostname: string) => void;
}) {
  const sitesHeadingId = useId();
  const selectedSiteRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    selectedSiteRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selection]);

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-b @3xl:h-full @3xl:border-b-0 @3xl:border-e">
      <nav aria-label={t('settingsTitle')} className="flex min-h-0 flex-col gap-3 p-3 @3xl:flex-1">
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant={selection.kind === 'settings' ? 'default' : 'outline'}
            aria-current={selection.kind === 'settings' ? 'page' : undefined}
            isDisabled={pending}
            className="justify-start"
            onPress={() => {
              onSelectPane({ kind: 'settings' });
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
              onSelectPane({ kind: 'global' });
            }}
          >
            {t('settingsDefaults')}
          </Button>
        </div>
        <Separator className="shrink-0" />
        <div className="flex min-h-0 flex-col gap-2 @3xl:flex-1">
          <p
            id={sitesHeadingId}
            className="shrink-0 px-2 text-xs font-medium text-muted-foreground"
          >
            {t('settingsSites')}
          </p>
          <div
            role="region"
            aria-labelledby={sitesHeadingId}
            className="max-h-[min(12rem,40svh)] min-h-0 overflow-y-auto overscroll-y-contain @3xl:max-h-none @3xl:flex-1"
          >
            {customSites.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">{t('settingsNoSites')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {customSites.map((hostname) => {
                  const selected = selection.kind === 'site' && selection.hostname === hostname;
                  return (
                    <li key={hostname}>
                      <button
                        ref={selected ? selectedSiteRef : undefined}
                        type="button"
                        disabled={pending}
                        aria-current={selected ? 'page' : undefined}
                        className={cn(
                          buttonVariants({
                            size: 'sm',
                            variant: selected ? 'default' : 'ghost',
                          }),
                          'w-full justify-start',
                        )}
                        onClick={() => {
                          onSelectSite(hostname);
                        }}
                      >
                        <span className="truncate">{hostname}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </nav>
    </aside>
  );
}
