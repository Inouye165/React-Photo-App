import path from 'path';

// Lightweight shapes to avoid coupling to route-specific types.
type PhotoRow = {
  id: string;
  user_id: string;
  filename: string;
  original_filename?: string | null;
  state: string;
  metadata?: string | Record<string, unknown> | null;
  hash?: string | null;
  file_size?: number | null;
  caption?: string | null;
  description?: string | null;
  keywords?: string | null;
  text_style?: string | null;
  edited_filename?: string | null;
  storage_path?: string | null;
  original_path?: string | null;
  display_path?: string | null;
  thumb_path?: string | null;
  thumb_small_path?: string | null;
  updated_at?: string | null;
};

type PhotosDb = {
  resolvePhotoPrimaryId: (id: string, userId: string) => Promise<string | null>;
  getPhotoById: (id: string, userId: string) => Promise<PhotoRow | null>;
  updatePhoto: (id: string, userId: string, updates: Record<string, unknown>) => Promise<unknown>;
  updatePhotoMetadata: (id: string, userId: string, updates: Record<string, unknown>) => Promise<unknown>;
};

type PhotosStorage = {
  listPhotos: (path: string, options: { search: string }) => Promise<{ data?: Array<{ name?: string }> | null }>;
  uploadPhoto: (path: string, data: Buffer, options: { contentType: string; duplex?: boolean }) => Promise<{ error?: { message?: string } | null }>;
  deletePhotos: (paths: string[]) => Promise<{ error?: { message?: string } | null }>;
  downloadPhoto: (path: string) => Promise<{ data: { stream: () => NodeJS.ReadableStream; arrayBuffer: () => Promise<ArrayBuffer> }; error?: { message?: string } | null }>;
};

type PhotosImage = {
  convertHeicToJpeg: (buffer: Buffer) => Promise<Buffer>;
  extractMetadata: (buffer: Buffer, filename?: string) => Promise<Record<string, unknown>>;
  computeHash: (buffer: Buffer) => string;
};

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type SaveCaptionedImageArgs = {
  photoId: string;
  userId: string;
  dataURL: string;
  caption?: string;
  description?: string;
  keywords?: string;
  textStyle?: unknown;
  photosDb: PhotosDb;
  photosStorage: PhotosStorage;
  photosImage: PhotosImage;
  logger: Logger;
};

type SaveCaptionedImageResult = {
  photo: PhotoRow;
  editedFilename: string;
  editedPath: string;
  metadata: Record<string, unknown>;
  hash: string;
  fileSize: number;
  textStyleJson: string | null;
  caption?: string | null;
  description?: string | null;
  keywords?: string | null;
};

type ReextractMetadataArgs = {
  photo: PhotoRow;
  userId: string;
  photosDb: PhotosDb;
  logger: Logger;
  strict: boolean;
};

const DATA_URL_REGEX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

export function sanitizeDownloadName(row: { id: string; original_filename?: string | null; filename?: string | null }): string {
  const rawName = String(row.original_filename || row.filename || `photo-${row.id}`);
  const baseName = path.posix.basename(rawName.replace(/\\/g, '/')).trim() || `photo-${row.id}`;
  return baseName.slice(0, 180).replace(/[^a-zA-Z0-9._ -]/g, '_');
}

export function parseImageDataUrl(dataURL: string): Buffer {
  if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) {
    throw new Error('Invalid image dataURL');
  }
  const match = dataURL.match(DATA_URL_REGEX);
  if (!match) {
    throw new Error('Unsupported data URL format');
  }
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer || buffer.length === 0) throw new Error('Image data is empty');
    return buffer;
  } catch {
    throw new Error('Unable to decode image data');
  }
}

export async function findAvailableEditedFilename(photosStorage: PhotosStorage, originalFilename: string): Promise<string> {
  const originalExt = path.extname(originalFilename);
  const baseName = path.basename(originalFilename, originalExt);
  let editedFilename = `${baseName}-edit.jpg`;
  let counter = 1;

  while (true) {
    const { data: existingFiles } = await photosStorage.listPhotos('inprogress', { search: editedFilename });
    if (!existingFiles || existingFiles.length === 0) break;
    editedFilename = `${baseName}-edit-${counter}.jpg`;
    counter += 1;
  }

  return editedFilename;
}

export function buildDeleteList(row: PhotoRow): string[] {
  const mainPath = row.storage_path || `${row.state}/${row.filename}`;
  const servedPath = row.display_path || mainPath;
  const legacyLargeThumbPath = row.hash ? `thumbnails/${row.hash}.jpg` : null;
  const legacySmallThumbPath = row.hash ? `thumbnails/${row.hash}-sm.jpg` : null;

  const thumbLargePath = row.thumb_path || legacyLargeThumbPath;
  const thumbSmallPath = row.thumb_small_path || legacySmallThumbPath;
  const editedPath = row.edited_filename ? `inprogress/${row.edited_filename}` : null;

  const paths = new Set<string>();
  const addPath = (p: unknown) => {
    if (typeof p !== 'string') return;
    const trimmed = p.trim();
    if (!trimmed) return;
    paths.add(trimmed);
  };

  // Derivatives first to avoid orphaned assets.
  addPath(thumbSmallPath);
  addPath(thumbLargePath);
  addPath(editedPath);

  // Primary objects (may overlap).
  addPath(row.original_path);
  addPath(mainPath);
  addPath(row.display_path);

  const ordered: string[] = [];
  const pushIfPresent = (p: string | null) => {
    if (!p) return;
    if (paths.has(p)) ordered.push(p);
  };

  pushIfPresent(thumbSmallPath);
  pushIfPresent(thumbLargePath);
  pushIfPresent(editedPath);

  if (servedPath !== mainPath) pushIfPresent(mainPath);
  if (row.original_path && row.original_path !== servedPath) pushIfPresent(row.original_path);
  if (row.display_path && row.display_path !== servedPath) pushIfPresent(row.display_path);

  // Served asset last to minimize broken public URLs if deletion partially fails.
  pushIfPresent(servedPath);

  const seen = new Set<string>();
  return ordered.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

export async function saveCaptionedImageWorkflow(args: SaveCaptionedImageArgs): Promise<SaveCaptionedImageResult> {
  const { photoId, userId, dataURL, caption, description, keywords, textStyle, photosDb, photosStorage, photosImage, logger } = args;

  const resolvedId = await photosDb.resolvePhotoPrimaryId(photoId, userId);
  if (!resolvedId) throw new Error('Photo not found');

  const photoRow = await photosDb.getPhotoById(resolvedId, userId);
  if (!photoRow) throw new Error('Photo not found');

  const imageBuffer = parseImageDataUrl(dataURL);
  const editedFilename = await findAvailableEditedFilename(photosStorage, photoRow.filename);

  const orientedBuffer = await photosImage.convertHeicToJpeg(imageBuffer);
  const editedPath = `inprogress/${editedFilename}`;
  const { error: uploadError } = await photosStorage.uploadPhoto(editedPath, orientedBuffer, { contentType: 'image/jpeg', duplex: false });
  if (uploadError) {
    logger.error('Supabase upload error for edited image:', uploadError);
    throw new Error('Failed to upload edited image to storage');
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = await photosImage.extractMetadata(orientedBuffer);
  } catch (metaErr) {
    const err = metaErr as Error;
    logger.warn('Failed to parse metadata for edited image', err?.message);
  }

  let mergedMetadata = metadata || {};
  try {
    const { mergeMetadataPreservingLocationAndDate } = require('../media/backgroundProcessor');
    const existingMeta = typeof photoRow.metadata === 'string' ? JSON.parse(photoRow.metadata || '{}') : (photoRow.metadata || {});
    mergedMetadata = mergeMetadataPreservingLocationAndDate(existingMeta, metadata);
  } catch (mergeErr) {
    const err = mergeErr as Error;
    logger.warn('Failed to merge metadata for edited image; falling back to extracted metadata only', err?.message);
  }

  const newHash = photosImage.computeHash(orientedBuffer);
  const now = new Date().toISOString();

  const newCaption = caption !== undefined ? caption : photoRow.caption;
  const newDescription = description !== undefined ? description : photoRow.description;
  const newKeywords = keywords !== undefined ? keywords : photoRow.keywords;
  const newTextStyleJson = textStyle === undefined ? photoRow.text_style : textStyle === null ? null : JSON.stringify(textStyle);

  await photosDb.updatePhoto(resolvedId, userId, {
    edited_filename: editedFilename,
    caption: newCaption,
    description: newDescription,
    keywords: newKeywords,
    text_style: newTextStyleJson,
    metadata: JSON.stringify(mergedMetadata || {}),
    hash: newHash,
    file_size: orientedBuffer.length,
    storage_path: editedPath,
    updated_at: now,
  });

  return {
    photo: photoRow,
    editedFilename,
    editedPath,
    metadata: mergedMetadata,
    hash: newHash,
    fileSize: orientedBuffer.length,
    textStyleJson: newTextStyleJson,
    caption: newCaption,
    description: newDescription,
    keywords: newKeywords,
  };
}

async function downloadWithHeicFallback(downloadFromStorage: (filename: string) => Promise<Buffer>, filename: string): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const buffer = await downloadFromStorage(filename);
    return { buffer, filename };
  } catch {
    const processedFilename = filename.replace(/\.heic$/i, '.heic.processed.jpg');
    try {
      const buffer = await downloadFromStorage(processedFilename);
      return { buffer, filename: processedFilename };
    } catch {
      return null;
    }
  }
}

export async function reextractMetadataWorkflow(args: ReextractMetadataArgs): Promise<Record<string, unknown> | null> {
  const { photo, userId, photosDb, logger, strict } = args;
  const { downloadFromStorage, extractMetadata, mergeMetadataPreservingLocationAndDate } = require('../media/backgroundProcessor');

  const downloadResult = await downloadWithHeicFallback(downloadFromStorage, photo.filename);
  if (!downloadResult) {
    if (strict) throw new Error('Failed to download photo from storage');
    logger.warn(`Could not re-extract metadata for photo ${photo.id}: download failed`);
    return null;
  }

  const metadata = await extractMetadata(downloadResult.buffer, downloadResult.filename);
  if (!metadata || Object.keys(metadata).length === 0) {
    if (strict) throw new Error('Failed to extract metadata');
    logger.warn(`Metadata extraction produced no fields for photo ${photo.id}`);
    return null;
  }

  let merged: Record<string, unknown> = metadata;
  try {
    const existing = typeof photo.metadata === 'string' ? JSON.parse(photo.metadata || '{}') : (photo.metadata || {});
    merged = mergeMetadataPreservingLocationAndDate(existing, metadata);
  } catch (mergeErr) {
    const err = mergeErr as Error;
    logger.warn(`Metadata merge failed for photo ${photo.id}: ${err.message}`);
  }

  await photosDb.updatePhotoMetadata(photo.id, userId, {
    metadata: JSON.stringify(merged),
  });

  return merged;
}
