const { safeParseObject, safeParseUnknown } = require('./json');

function isSafeStorageObjectPath(p) {
  if (!p || typeof p !== 'string') return false;
  // Disallow traversal and absolute paths.
  if (p.includes('..') || p.startsWith('/') || p.startsWith('\\')) return false;
  // Allow a conservative charset.
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(p)) return false;
  return true;
}

async function createSignedCdnUrl({ supabaseClient, bucket, storagePath, ttlSeconds }) {
  if (!supabaseClient || !bucket || !storagePath) return null;
  if (!isSafeStorageObjectPath(storagePath)) return null;
  // Thumbnails must always come from the thumbnails/ prefix.
  if (!storagePath.startsWith('thumbnails/')) return null;

  const fromFn = supabaseClient?.storage?.from;
  if (typeof fromFn !== 'function') return null;

  const ttl = Number(ttlSeconds);
  const effectiveTtl = Number.isFinite(ttl) ? ttl : 3600;

  try {
    const bucketApi = fromFn.call(supabaseClient.storage, bucket);
    const createSignedUrlFn = bucketApi?.createSignedUrl;
    if (typeof createSignedUrlFn !== 'function') return null;

    const { data, error } = await createSignedUrlFn.call(bucketApi, storagePath, effectiveTtl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

async function mapPhotoRowToListDto(row, { signThumbnailUrl, ttlSeconds, supabaseClient } = {}) {
  const metadata = safeParseObject(row.metadata) || {};
  const textStyle = safeParseObject(row.text_style);
  const aiModelHistory = row.ai_model_history ? safeParseUnknown(row.ai_model_history) : null;
  const poiAnalysis = row.poi_analysis ? safeParseUnknown(row.poi_analysis) : null;

  let thumbnailUrl = null;
  let smallThumbnailUrl = null;

  // Prefer embedding a signed CDN URL (Supabase Storage signed URL) to avoid client-side N+1.
  if (supabaseClient) {
    const largeThumbPath = row.thumb_path || (row.hash ? `thumbnails/${row.hash}.jpg` : null);
    const smallThumbPath = row.thumb_small_path || null;

    // Best-effort parallel signing.
    const [largeSigned, smallSigned] = await Promise.all([
      largeThumbPath ? createSignedCdnUrl({ supabaseClient, bucket: 'photos', storagePath: largeThumbPath, ttlSeconds }) : Promise.resolve(null),
      smallThumbPath ? createSignedCdnUrl({ supabaseClient, bucket: 'photos', storagePath: smallThumbPath, ttlSeconds }) : Promise.resolve(null),
    ]);

    thumbnailUrl = largeSigned;
    smallThumbnailUrl = smallSigned;
  }

  // Backward-compatible fallback: HMAC-signed /display/thumbnails URL.
  // This path will still work via the /display router (and keeps private bucket semantics).
  if (!thumbnailUrl && row.hash && typeof signThumbnailUrl === 'function' && Number.isFinite(ttlSeconds)) {
    const { sig, exp } = signThumbnailUrl(row.hash, ttlSeconds);
    thumbnailUrl = `/display/thumbnails/${row.hash}.jpg?sig=${encodeURIComponent(sig)}&exp=${exp}`;
  }

  const photoUrl = `/display/image/${row.id}`;
  const originalUrl = `/photos/${row.id}/original`;

  return {
    id: row.id,
    filename: row.filename,
    state: row.state,
    metadata,
    hash: row.hash,
    file_size: row.file_size,
    caption: row.caption,
    description: row.description,
    keywords: row.keywords,
    textStyle,
    editedFilename: row.edited_filename || null,
    storagePath: row.storage_path || null,
    url: photoUrl,
    originalUrl,
    thumbnail: thumbnailUrl,
    smallThumbnail: smallThumbnailUrl,
    aiModelHistory,
    poi_analysis: poiAnalysis,
    classification: row.classification,
  };
}

function mapPhotoRowToDetailDto(row) {
  const metadata = safeParseObject(row.metadata) || {};
  const textStyle = safeParseObject(row.text_style);
  const aiModelHistory = row.ai_model_history ? safeParseUnknown(row.ai_model_history) : null;
  const poiAnalysis = row.poi_analysis ? safeParseUnknown(row.poi_analysis) : null;

  const thumbnail = row.hash ? `/display/thumbnails/${row.hash}.jpg` : null;
  const url = `/display/image/${row.id}`;
  const originalUrl = `/photos/${row.id}/original`;

  let collectible_insights = null;
  if (row.collectible_value_min != null || row.collectible_value_max != null) {
    collectible_insights = {
      estimatedValue: {
        min: row.collectible_value_min != null ? parseFloat(row.collectible_value_min) : null,
        max: row.collectible_value_max != null ? parseFloat(row.collectible_value_max) : null,
        currency: row.collectible_currency || 'USD'
      },
      category: row.collectible_category,
      specifics: safeParseObject(row.collectible_specifics)
    };
  }

  return {
    id: row.id,
    filename: row.filename,
    state: row.state,
    metadata,
    hash: row.hash,
    file_size: row.file_size,
    caption: row.caption,
    description: row.description,
    keywords: row.keywords,
    textStyle,
    editedFilename: row.edited_filename,
    storagePath: row.storage_path,
    url,
    originalUrl,
    thumbnail,
    aiModelHistory,
    poi_analysis: poiAnalysis,
    collectible_insights,
    classification: row.classification,
  };
}

module.exports = {
  mapPhotoRowToListDto,
  mapPhotoRowToDetailDto,
};
