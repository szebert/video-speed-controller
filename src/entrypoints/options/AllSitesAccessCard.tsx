// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react';
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

type LatestAccess = { kind: 'stale' } | { kind: 'granted'; value: boolean } | { kind: 'error' };

async function latestContains(readGeneration: { current: number }): Promise<LatestAccess> {
  const generation = ++readGeneration.current;
  try {
    const granted = await containsAllSitesAccess();
    if (generation !== readGeneration.current) {
      return { kind: 'stale' };
    }
    return { kind: 'granted', value: granted };
  } catch {
    if (generation !== readGeneration.current) {
      return { kind: 'stale' };
    }
    return { kind: 'error' };
  }
}

export function AllSitesAccessCard() {
  const [hasAllSitesAccess, setHasAllSitesAccess] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readGeneration = useRef(0);

  const applyAccess = (result: LatestAccess): boolean | undefined => {
    if (result.kind === 'stale') {
      return undefined;
    }
    if (result.kind === 'granted') {
      setHasAllSitesAccess(result.value);
      setError(null);
      return result.value;
    }
    setError(t('allSitesAccessError'));
    return undefined;
  };

  useEffect(() => {
    const refresh = async (): Promise<void> => {
      applyAccess(await latestContains(readGeneration));
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
      readGeneration.current += 1;
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
          applyAccess(await latestContains(readGeneration));
          return;
        }
      } else {
        await removeAllSitesAccess();
      }
      applyAccess(await latestContains(readGeneration));
    } catch {
      applyAccess(await latestContains(readGeneration));
      setError(t('allSitesAccessError'));
    } finally {
      setPending(false);
    }
  };

  const known = hasAllSitesAccess !== null;
  const disabled = pending || !known;

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
            data-disabled={disabled || undefined}
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
              isDisabled={disabled}
              isSelected={hasAllSitesAccess === true}
              onChange={(enabled) => {
                const grant =
                  enabled && hasAllSitesAccess !== true ? requestAllSitesAccess() : undefined;
                void onToggle(enabled, grant);
              }}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
