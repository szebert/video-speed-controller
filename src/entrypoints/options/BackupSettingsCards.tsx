// SPDX-License-Identifier: GPL-3.0-only

import { useRef, useState } from 'react';
import { FileJsonIcon, XIcon } from 'lucide-react';
import { DropZone } from 'react-aria-components';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import { formatBackupFileSize, readAndParseBackupFile, type StagedBackupFile } from './backup-file';

type BackupSettingsCardsProps = {
  pending: boolean;
  onExport: () => void;
  onImport: (mode: 'merge' | 'replace', backupText: string) => Promise<boolean>;
};

export function BackupSettingsCards({ pending, onExport, onImport }: BackupSettingsCardsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedBackupFile | null>(null);
  const [pendingImport, setPendingImport] = useState<'merge' | 'replace' | null>(null);

  function clearStaged(): void {
    setStaged(null);
    setPendingImport(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function stageFile(file: File | undefined): void {
    if (!file) {
      return;
    }
    void readAndParseBackupFile(file).then((next) => {
      setStaged(next);
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('exportSettings')}</CardTitle>
          <CardDescription>{t('exportSettingsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            isDisabled={pending}
            onPress={() => {
              onExport();
            }}
          >
            {t('exportSettings')}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('importSettings')}</CardTitle>
          <CardDescription>{t('importSettingsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              stageFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            isDisabled={pending}
            onPress={() => {
              fileInputRef.current?.click();
            }}
          >
            {t('importSettings')}
          </Button>
          <DropZone
            aria-label={t('importDropzone')}
            isDisabled={pending}
            getDropOperation={() => 'copy'}
            onDrop={(event) => {
              const item = event.items.find((next) => next.kind === 'file');
              if (item?.kind !== 'file') {
                return;
              }
              void item.getFile().then((file) => {
                stageFile(file);
              });
            }}
            className={({ isDropTarget, defaultClassName }) =>
              cn('w-fit rounded-xl', isDropTarget && 'ring-2 ring-ring', defaultClassName)
            }
          >
            <Attachment state={staged?.status === 'error' ? 'error' : staged ? 'done' : 'idle'}>
              <AttachmentMedia>
                <FileJsonIcon />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{staged?.fileName ?? t('noBackupFile')}</AttachmentTitle>
                <AttachmentDescription
                  className={staged?.status === 'error' ? 'whitespace-normal' : undefined}
                >
                  {staged?.status === 'error'
                    ? staged.error
                    : staged
                      ? `${t('backupFileType')} · ${formatBackupFileSize(staged.byteLength)}`
                      : t('backupFileType')}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={t('removeBackupFile')}
                  isDisabled={pending || !staged}
                  onPress={() => {
                    clearStaged();
                  }}
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          </DropZone>
          <ButtonGroup aria-label={t('importBackupActions')}>
            <Button
              type="button"
              variant="outline"
              isDisabled={pending || staged?.status !== 'ready'}
              onPress={() => {
                setPendingImport('merge');
              }}
            >
              {t('importMerge')}
            </Button>
            <Button
              type="button"
              variant="outline"
              isDisabled={pending || staged?.status !== 'ready'}
              onPress={() => {
                setPendingImport('replace');
              }}
            >
              {t('importReplace')}
            </Button>
          </ButtonGroup>
          <AlertDialog
            isOpen={pendingImport != null}
            onOpenChange={(open) => {
              if (!open) {
                setPendingImport(null);
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingImport === 'replace' ? t('importReplace') : t('importMerge')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingImport === 'replace' ? t('importReplaceConfirm') : t('importMergeConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant={pendingImport === 'replace' ? 'destructive' : 'default'}
                onPress={() => {
                  if (!pendingImport || staged?.status !== 'ready') {
                    return;
                  }
                  const mode = pendingImport;
                  const backupText = staged.backupText;
                  setPendingImport(null);
                  void onImport(mode, backupText).then((imported) => {
                    if (imported) {
                      clearStaged();
                    }
                  });
                }}
              >
                {t('confirmImport')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  );
}
