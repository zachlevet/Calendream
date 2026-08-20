import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

import { parseBackupText, serializeBackup, type CalendreamBackup } from '@/database/backupFormat';

type NativeFile = File & {
  uri: string;
  create(options?: { intermediates?: boolean; overwrite?: boolean }): void;
  write(contents: string): void;
  text(): Promise<string>;
};

export async function shareBackupFile(backup: CalendreamBackup) {
  const file = new File(Paths.cache, backupFilename(backup.createdAt)) as NativeFile;
  file.create({ intermediates: true, overwrite: true });
  file.write(serializeBackup(backup));
  return Share.share(
    { title: 'Calendream backup', url: file.uri },
    { subject: 'Calendream backup' },
  );
}

export async function writeRecoveryBackup(backup: CalendreamBackup) {
  const file = new File(Paths.document, 'Calendream-Recovery-Latest.calendream.json') as NativeFile;
  file.create({ intermediates: true, overwrite: true });
  file.write(serializeBackup(backup));
  return file.uri;
}

export async function pickBackupFile(supportedDatabaseVersion: number) {
  const selection = await File.pickFileAsync({
    mimeTypes: ['application/json', 'text/json', 'public.json'],
  });
  if (selection.canceled || !selection.result) return null;
  return parseBackupText(await (selection.result as NativeFile).text(), supportedDatabaseVersion);
}

function backupFilename(createdAt: string) {
  const timestamp = createdAt.replace(/[:.]/g, '-');
  return `Calendream-${timestamp}.calendream.json`;
}
