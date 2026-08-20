import { parseBackupText, serializeBackup, type CalendreamBackup } from '@/database/backupFormat';

export async function shareBackupFile(backup: CalendreamBackup) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([serializeBackup(backup)], { type: 'application/json' }));
  anchor.download = `Calendream-${backup.createdAt.replace(/[:.]/g, '-')}.calendream.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  return { action: 'sharedAction' as const };
}

export async function writeRecoveryBackup(_backup: CalendreamBackup) {
  return '';
}

export async function pickBackupFile(_supportedDatabaseVersion: number) {
  throw new Error('Backup restore is currently available in the iPhone app.');
}

export { parseBackupText };
