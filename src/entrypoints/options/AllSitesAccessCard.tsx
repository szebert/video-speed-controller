// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import { InfoIcon } from 'lucide-react';
import {
  containsAllSitesAccess,
  removeAllSitesAccess,
  requestAllSitesAccess,
} from '@/access/site-access';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { t } from '@/i18n/t';

const SWITCH_ID = 'all-sites-access';
const HELP_ID = `${SWITCH_ID}-help`;
const ERROR_ID = `${SWITCH_ID}-error`;

export function AllSitesAccessCard() {
  const [hasAllSitesAccess, setHasAllSitesAccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      try {
        const granted = await containsAllSitesAccess();
        if (cancelled) {
          return;
        }
        setHasAllSitesAccess(granted);
        setError(null);
      } catch {
        if (!cancelled) {
          setError(t('allSitesAccessError'));
        }
      }
    };

    void refresh();
    const onExternalChange = (): void => {
      void refresh();
    };
    window.addEventListener('focus', onExternalChange);
    document.addEventListener('visibilitychange', onExternalChange);
    chrome.permissions.onAdded.addListener(onExternalChange);
    chrome.permissions.onRemoved.addListener(onExternalChange);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onExternalChange);
      document.removeEventListener('visibilitychange', onExternalChange);
      chrome.permissions.onAdded.removeListener(onExternalChange);
      chrome.permissions.onRemoved.removeListener(onExternalChange);
    };
  }, []);

  const onToggle = async (enabled: boolean, grant?: Promise<boolean>): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      if (enabled) {
        const granted = await (grant ?? requestAllSitesAccess());
        if (!granted) {
          const actual = await containsAllSitesAccess();
          setHasAllSitesAccess(actual);
          return;
        }
      } else {
        await removeAllSitesAccess();
      }
      const actual = await containsAllSitesAccess();
      setHasAllSitesAccess(actual);
    } catch {
      try {
        const actual = await containsAllSitesAccess();
        setHasAllSitesAccess(actual);
      } catch {
        // Keep the last known hasAllSitesAccess.
      }
      setError(t('allSitesAccessError'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('enableOnAllSites')}</CardTitle>
        <CardDescription>{t('enableOnAllSitesDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <InfoIcon />
          <AlertTitle>{t('allSitesAccessAlertTitle')}</AlertTitle>
          <AlertDescription>{t('allSitesAccessAlertDescription')}</AlertDescription>
        </Alert>
        <FieldGroup>
          <Field
            orientation="horizontal"
            className="min-w-0"
            data-disabled={pending || undefined}
            data-invalid={error ? true : undefined}
          >
            <FieldContent className="min-w-0 flex-[1_1_12rem]">
              <FieldLabel htmlFor={SWITCH_ID}>{t('enableOnAllSites')}</FieldLabel>
              <FieldDescription id={HELP_ID}>
                {t('allSitesAccessSwitchDescription')}
              </FieldDescription>
              <FieldError id={ERROR_ID}>{error}</FieldError>
            </FieldContent>
            <Switch
              id={SWITCH_ID}
              name="allSitesAccess"
              aria-describedby={error ? `${HELP_ID} ${ERROR_ID}` : HELP_ID}
              aria-invalid={error ? true : undefined}
              isDisabled={pending}
              isSelected={hasAllSitesAccess}
              onChange={(enabled) => {
                const grant = enabled && !hasAllSitesAccess ? requestAllSitesAccess() : undefined;
                void onToggle(enabled, grant);
              }}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
