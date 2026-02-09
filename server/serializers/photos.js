const { safeParseObject, safeParseUnknown } = require('./json');
const path = require('path');

function extractThumbnailBasename(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return null;
  // Disallow traversal and absolute paths.
  if (storagePath.includes('..') || storagePath.startsWith('/') || storagePath.startsWith('\\')) return null;
  // Thumbnails must always come from the thumbnails/ prefix.
  if (!storagePath.startsWith('thumbnails/')) return null;

  const base = path.posix.basename(storagePath);
  if (!base || base === '.' || base === '..') return null;
  if (!base.endsWith('.webp')) return null;
  if (!/^[a-zA-Z0-9_.-]+\.webp$/.test(base)) return null;
  return base;
}

function buildSignedThumbnailDisplayUrl(storagePath, { signThumbnailUrl, ttlSeconds }) {
  const base = extractThumbnailBasename(storagePath);
  if (!base) return null;
  if (typeof signThumbnailUrl !== 'function') return null;

  const hashBase = base.slice(0, -'.webp'.length);
  const ttl = Number(ttlSeconds);
  const { sig, exp } = Number.isFinite(ttl) ? signThumbnailUrl(hashBase, ttl) : signThumbnailUrl(hashBase);

  return `/display/thumbnails/${base}?sig=${encodeURIComponent(sig)}&exp=${exp}`;
}

async function mapPhotoRowToListDto(row, { signThumbnailUrl, ttlSeconds } = {}) {
  const metadata = safeParseObject(row.metadata) || {};
  const textStyle = safeParseObject(row.text_style);
  const aiModelHistory = row.ai_model_history ? safeParseUnknown(row.ai_model_history) : null;
  const poiAnalysis = row.poi_analysis ? safeParseUnknown(row.poi_analysis) : null;

  const largeThumbPath = row.thumb_path || (row.hash ? `thumbnails/${row.hash}.webp` : null);
  const smallThumbPath = row.thumb_small_path || null;

  const thumbnailUrl = largeThumbPath
    ? buildSignedThumbnailDisplayUrl(largeThumbPath, { signThumbnailUrl, ttlSeconds })
    : null;
  const smallThumbnailUrl = smallThumbPath
    ? buildSignedThumbnailDisplayUrl(smallThumbPath, { signThumbnailUrl, ttlSeconds })
    : null;
  const resolvedSmallThumbnailUrl = smallThumbnailUrl || thumbnailUrl;

  const photoUrl = `/display/image/${row.id}`;
  const originalUrl = `/photos/${row.id}/original`;

  return {
    id: row.id,
    filename: row.filename,
    state: row.state,
    derivativesStatus: row.derivatives_status || null,
    derivativesError: row.derivatives_error || null,
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
    smallThumbnail: resolvedSmallThumbnailUrl,
    thumbnailUrl,
    smallThumbnailUrl: resolvedSmallThumbnailUrl,
    aiModelHistory,
    poi_analysis: poiAnalysis,
    classification: row.classification,
  };
}

function mapPhotoRowToDetailDto(row, { signThumbnailUrl, ttlSeconds } = {}) {
  const metadata = safeParseObject(row.metadata) || {};
  const textStyle = safeParseObject(row.text_style);
  const aiModelHistory = row.ai_model_history ? safeParseUnknown(row.ai_model_history) : null;
  const poiAnalysis = row.poi_analysis ? safeParseUnknown(row.poi_analysis) : null;

  const largeThumbPath = row.thumb_path || (row.hash ? `thumbnails/${row.hash}.webp` : null);
  const smallThumbPath = row.thumb_small_path || null;
  const directThumbnailUrl = row.hash ? `/display/thumbnails/${row.hash}.webp` : null;

  const thumbnailUrl = largeThumbPath
    ? buildSignedThumbnailDisplayUrl(largeThumbPath, { signThumbnailUrl, ttlSeconds }) || directThumbnailUrl
    : directThumbnailUrl;
  const smallThumbnailUrl = smallThumbPath
    ? buildSignedThumbnailDisplayUrl(smallThumbPath, { signThumbnailUrl, ttlSeconds })
    : null;
  const resolvedSmallThumbnailUrl = smallThumbnailUrl || thumbnailUrl;

  const url = `/display/image/${row.id}`;
  const fullUrl = url;
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
    derivativesStatus: row.derivatives_status || null,
    derivativesError: row.derivatives_error || null,
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
    thumbnail: thumbnailUrl,
    smallThumbnail: resolvedSmallThumbnailUrl,
    thumbnailUrl,
    smallThumbnailUrl: resolvedSmallThumbnailUrl,
    fullUrl,
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
