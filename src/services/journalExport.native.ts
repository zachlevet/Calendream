import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

import CalendreamNative from '../../modules/calendream-mapkit/src/CalendreamMapKitModule';
import type { JournalEntry } from '@/models/planning';
import { journalExportFilename, journalPlainText } from '@/features/library/journalExport';

type NativeFile = File & {
  uri: string;
  create(options?: { intermediates?: boolean; overwrite?: boolean }): void;
  write(contents: string): void;
};

export async function shareJournalPDF(entries: JournalEntry[]) {
  if (!CalendreamNative) throw new Error('PDF export is not available in this build yet.');
  const uri = await CalendreamNative.createJournalPDFAsync(journalPlainText(entries), journalExportFilename('pdf'));
  return Share.share(
    { title: 'Calendream Journal', url: uri },
    { subject: journalExportFilename('pdf') },
  );
}

export async function shareJournalText(entries: JournalEntry[]) {
  const file = new File(Paths.cache, journalExportFilename('txt')) as NativeFile;
  file.create({ intermediates: true, overwrite: true });
  file.write(journalPlainText(entries));
  return Share.share(
    { title: 'Calendream Journal', url: file.uri },
    { subject: 'Calendream Journal' },
  );
}

export async function sendJournalToNotes(entries: JournalEntry[]) {
  return Share.share(
    { title: 'Calendream Journal', message: journalPlainText(entries) },
    { subject: 'Calendream Journal' },
  );
}
