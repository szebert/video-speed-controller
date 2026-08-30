// SPDX-License-Identifier: GPL-3.0-only

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { t } from '@/i18n/t';
import type { Selection } from 'react-aria-components';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ThemePreference } from '@/settings/theme';

const THEMES = [
  { key: 'dark', Icon: MoonIcon },
  { key: 'light', Icon: SunIcon },
  { key: 'system', Icon: MonitorIcon },
] as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') {
      return;
    }
    const [key] = [...keys];
    if (isThemePreference(key)) {
      setTheme(key);
    }
  };

  const CurrentIcon = THEMES.find((item) => item.key === theme)?.Icon ?? MoonIcon;

  return (
    <DropdownMenuTrigger>
      <Button variant="ghost" size="icon" aria-label={t('changeTheme')}>
        <CurrentIcon data-icon="inline-start" />
      </Button>
      <DropdownMenu
        aria-label={t('changeTheme')}
        className="min-w-36"
        placement="bottom end"
        selectionMode="single"
        selectedKeys={new Set([theme])}
        onSelectionChange={onSelectionChange}
      >
        {THEMES.map(({ key, Icon }) => (
          <DropdownMenuItem key={key} id={key} textValue={themeLabel(key)}>
            <Icon />
            {themeLabel(key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

function themeLabel(key: ThemePreference): string {
  if (key === 'dark') {
    return t('themeDark');
  }
  if (key === 'light') {
    return t('themeLight');
  }
  return t('themeSystem');
}
