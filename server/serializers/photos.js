const { safeParseObject, safeParseUnknown } = require('./json');

function mapPhotoRowToListDto(row, { signThumbnailUrl, ttlSeconds } = {}) {
  const metadata = safeParseObject(row.metadata) || {};
  const textStyle = safeParseObject(row.text_style);
  const aiModelHistory = row.ai_model_history ? safeParseUnknown(row.ai_model_history) : null;
  const poiAnalysis = row.poi_analysis ? safeParseUnknown(row.poi_analysis) : null;

  let thumbnailUrl = null;
  if (row.hash && typeof signThumbnailUrl === 'function' && Number.isFinite(ttlSeconds)) {
    const { sig, exp } = signThumbnailUrl(row.hash, ttlSeconds);
    thumbnailUrl = `/display/thumbnails/${row.hash}.jpg?sig=${encodeURIComponent(sig)}&exp=${exp}`;
  }

  const photoUrl = `/display/image/${row.id}`;

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
    thumbnail: thumbnailUrl,
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
    thumbnail,
    aiModelHistory,
    poi_analysis: poiAnalysis,
    classification: row.classification,
  };
}

module.exports = {
  mapPhotoRowToListDto,
  mapPhotoRowToDetailDto,
};
