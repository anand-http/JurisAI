import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';

import { authHeaders } from '../api/client';
import { draftsApi } from '../api/endpoints';
import type { ExportFormat, PaperSize } from '../api/types';
import { env } from '../config/env';
import { getEncrypted, setEncrypted } from '../storage/encryptedStore';

/**
 * Exported court files are downloaded into the app's private documents
 * folder so they can be opened and shared offline. The index of exports
 * (file names include party names) is kept in the encrypted store.
 */

export interface LocalExport {
  draftId: string;
  format: ExportFormat;
  paperSize: PaperSize;
  fileName: string;
  mimeType: string;
  path: string;
  createdAt: string;
}

const INDEX_KEY = 'exports:index';
const { fs } = ReactNativeBlobUtil;
const exportsRoot = () => `${fs.dirs.DocumentDir}/exports`;

async function readIndex(): Promise<LocalExport[]> {
  return (await getEncrypted<LocalExport[]>(INDEX_KEY)) ?? [];
}

export async function listExports(draftId?: string): Promise<LocalExport[]> {
  const all = await readIndex();
  // Drop entries whose file was removed by the OS or the user.
  const present = await Promise.all(all.map(e => fs.exists(e.path)));
  const existing = all.filter((_, i) => present[i]);
  if (existing.length !== all.length) {
    await setEncrypted(INDEX_KEY, existing);
  }
  return draftId ? existing.filter(e => e.draftId === draftId) : existing;
}

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function exportDraft(
  draftId: string,
  title: string,
  format: ExportFormat,
  paperSize: PaperSize,
  /** The lawyer ticked "I have reviewed this draft"; sent so the backend can record it. */
  acknowledgeIssues = false,
): Promise<LocalExport> {
  const result = await draftsApi.export(
    draftId,
    format,
    paperSize,
    acknowledgeIssues,
  );
  const dir = `${exportsRoot()}/${draftId}`;
  if (!(await fs.isDir(dir))) {
    await fs.mkdir(dir);
  }
  const fileName = `${sanitizeFileName(title)}.${result.format}`;
  const path = `${dir}/${fileName}`;
  if (await fs.exists(path)) {
    await fs.unlink(path);
  }

  if (result.url.startsWith('data:')) {
    await fs.writeFile(
      path,
      result.url.slice(result.url.indexOf(',') + 1),
      'base64',
    );
  } else {
    const response = await ReactNativeBlobUtil.config({
      path,
      overwrite: true,
    }).fetch(
      'GET',
      result.url,
      // Only send the session token to our own API, never to a storage bucket.
      result.url.startsWith(env.apiBaseUrl) ? authHeaders() : undefined,
    );
    const status = response.info().status;
    if (status >= 400) {
      await fs.unlink(path).catch(() => undefined);
      throw new Error(
        status === 403
          ? 'The download link expired. Please export again.'
          : `Download failed (HTTP ${status}). Please try again.`,
      );
    }
  }

  const entry: LocalExport = {
    draftId,
    format: result.format,
    paperSize,
    fileName,
    mimeType: MIME[result.format],
    path,
    createdAt: new Date().toISOString(),
  };
  const index = (await readIndex()).filter(e => e.path !== path);
  await setEncrypted(INDEX_KEY, [entry, ...index]);
  return entry;
}

/** Opens the native share sheet (WhatsApp, email, Drive, …). */
export async function shareExport(file: LocalExport): Promise<void> {
  await Share.open({
    url: `file://${file.path}`,
    type: file.mimeType,
    filename: file.fileName,
    failOnCancel: false,
  });
}

/**
 * Saves a copy outside the app: "Save to Files" on iOS, Downloads/JurisAI
 * on Android 10+. Returns a human description of where it went.
 */
export async function saveExportToDevice(
  file: LocalExport,
): Promise<string | null> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 29) {
    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      { name: file.fileName, parentFolder: 'JurisAI', mimeType: file.mimeType },
      'Download',
      file.path,
    );
    return 'Saved to Downloads/JurisAI';
  }
  await Share.open({
    url: `file://${file.path}`,
    type: file.mimeType,
    filename: file.fileName,
    saveToFiles: Platform.OS === 'ios',
    failOnCancel: false,
  });
  return null;
}

/** Opens the file in the system viewer — works offline. */
export async function openExport(file: LocalExport): Promise<void> {
  if (Platform.OS === 'ios') {
    ReactNativeBlobUtil.ios.previewDocument(file.path);
    return;
  }
  await ReactNativeBlobUtil.android.actionViewIntent(file.path, file.mimeType);
}

export async function deleteAllExports(): Promise<void> {
  if (await fs.isDir(exportsRoot())) {
    await fs.unlink(exportsRoot());
  }
}

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || 'Draft'
  );
}
