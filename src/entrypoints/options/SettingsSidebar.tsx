// SPDX-License-Identifier: GPL-3.0-only

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZIcon, ArrowUpZAIcon, ClockArrowDownIcon, ClockArrowUpIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Separator } from '@/components/ui/separator';
import { t } from '@/i18n/t';
import { cn } from 'cn';
import type { CustomSiteSummary } from '../../settings/site-summary';
import type { Selection } from './options-model';
import {
  nextSiteListSort,
  readStoredSiteListSort,
  sortCustomSites,
  writeStoredSiteListSort,
  type SiteListSort,
} from './site-list-sort';

export function SettingsSidebar({
  selection,
  customSites,
  pending,
  onSelectPane,
  onSelectSite,
}: {
  selection: Selection;
  customSites: CustomSiteSummary[];
  pending: boolean;
  onSelectPane: (next: Selection) => void;
  onSelectSite: (hostname: string) => void;
}) {
  const sitesHeadingId = useId();
  const selectedSiteRef = useRef<HTMLButtonElement>(null);
  const [sort, setSort] = useState<SiteListSort>(readStoredSiteListSort);
  const sortedSites = useMemo(() => sortCustomSites(customSites, sort), [customSites, sort]);

  useLayoutEffect(() => {
    selectedSiteRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selection]);

  function cycleSort(mode: SiteListSort['mode']): void {
    const next = nextSiteListSort(sort, mode);
    setSort(next);
    writeStoredSiteListSort(next);
  }

  const nameLabel =
    sort.mode === 'name' && sort.direction === 'desc'
      ? t('settingsSortNameDesc')
      : t('settingsSortNameAsc');
  const recentLabel =
    sort.mode === 'recent' && sort.direction === 'oldest'
      ? t('settingsSortRecentOldest')
      : t('settingsSortRecentNewest');
  const NameIcon =
    sort.mode === 'name' && sort.direction === 'desc' ? ArrowUpZAIcon : ArrowDownAZIcon;
  const RecentIcon =
    sort.mode === 'recent' && sort.direction === 'oldest' ? ClockArrowUpIcon : ClockArrowDownIcon;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-b md:h-full md:w-64 md:shrink-0 md:border-b-0 md:border-e">
      <nav aria-label={t('settingsTitle')} className="flex min-h-0 flex-col gap-3 p-3 md:flex-1">
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
        <div className="flex min-h-0 flex-col gap-2 md:flex-1">
          <div className="flex shrink-0 items-center justify-between gap-1">
            <p id={sitesHeadingId} className="px-2 text-xs font-medium text-muted-foreground">
              {t('settingsSites')}
            </p>
            <ButtonGroup aria-label={t('settingsSortSites')}>
              <Button
                type="button"
                size="icon-xs"
                variant={sort.mode === 'name' ? 'default' : 'outline'}
                aria-label={nameLabel}
                aria-pressed={sort.mode === 'name'}
                isDisabled={pending}
                onPress={() => {
                  cycleSort('name');
                }}
              >
                <NameIcon />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant={sort.mode === 'recent' ? 'default' : 'outline'}
                aria-label={recentLabel}
                aria-pressed={sort.mode === 'recent'}
                isDisabled={pending}
                onPress={() => {
                  cycleSort('recent');
                }}
              >
                <RecentIcon />
              </Button>
            </ButtonGroup>
          </div>
          <div
            role="region"
            aria-labelledby={sitesHeadingId}
            className="max-h-[min(12rem,40svh)] min-h-0 overflow-y-auto overscroll-y-contain md:max-h-none md:flex-1"
          >
            {sortedSites.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">{t('settingsNoSites')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {sortedSites.map((site) => {
                  const selected =
                    selection.kind === 'site' && selection.hostname === site.hostname;
                  return (
                    <li key={site.hostname}>
                      <button
                        ref={selected ? selectedSiteRef : undefined}
                        type="button"
                        disabled={pending}
                        aria-current={selected ? 'page' : undefined}
                        title={formatActivity(site.lastUsedAt)}
                        className={cn(
                          buttonVariants({
                            size: 'sm',
                            variant: selected ? 'default' : 'ghost',
                          }),
                          'w-full justify-start',
                        )}
                        onClick={() => {
                          onSelectSite(site.hostname);
                        }}
                      >
                        <span className="truncate">{site.hostname}</span>
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

function formatActivity(lastUsedAt: number): string | undefined {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(lastUsedAt);
  } catch {
    return undefined;
  }
}
