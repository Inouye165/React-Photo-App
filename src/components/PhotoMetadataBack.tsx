type ExifMetadata = {
  DateTimeOriginal?: string;
  CreateDate?: string;
  ModifyDate?: string;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  ISO?: number | string;
  ISOSpeedRatings?: number | string;
  FNumber?: number | string;
  ApertureValue?: number | string;
  ExposureTime?: number | string;
  Make?: string;
  Model?: string;
  LensModel?: string;
  LensMake?: string;
  FocalLength?: number | string;
  GPSImgDirection?: number | string;
};

type PhotoMetadataBackPhoto = {
  metadata?: ExifMetadata | null;
  taken_at?: string;
  created_at?: string;
  file_size?: number | string;
  hash?: string;
  filename?: string;
  original_filename?: string;
};

type PhotoMetadataBackProps = {
  keywords?: string;
  onKeywordsChange?: (value: string) => void;
  photo?: PhotoMetadataBackPhoto;
};

type DisplayMetadata = {
  date: string;
  size: string;
  dimensions: string;
  iso: string;
  aperture: string;
  shutter: string;
  camera: string;
  lens: string;
  focalLength: string;
  direction: string;
  hash: string;
  filename: string;
};

/**
 * PhotoMetadataBack Component
 * Displays the back face of the flip card with Keywords (editable) and Technical Metadata.
 */
export default function PhotoMetadataBack({
  keywords = '',
  onKeywordsChange,
  photo = {},
}: PhotoMetadataBackProps) {
  // EXIF metadata is stored in photo.metadata (parsed JSON from exifr)
  const meta = photo.metadata || {};

  // Extract technical metadata from photo.metadata (exifr format)
  const metadata: DisplayMetadata = {
    // Date: DateTimeOriginal > CreateDate > ModifyDate > photo timestamps
    date:
      meta.DateTimeOriginal ||
      meta.CreateDate ||
      meta.ModifyDate ||
      photo.taken_at ||
      photo.created_at ||
      'Unknown',
    // File size from photo (not in EXIF)
    size: photo.file_size ? formatFileSize(photo.file_size) : 'Unknown',
    // Dimensions: exifr provides ExifImageWidth/Height or ImageWidth/Height
    dimensions:
      meta.ExifImageWidth && meta.ExifImageHeight
        ? `${meta.ExifImageWidth} × ${meta.ExifImageHeight}`
        : meta.ImageWidth && meta.ImageHeight
          ? `${meta.ImageWidth} × ${meta.ImageHeight}`
          : 'Unknown',
    // ISO: ISOSpeedRatings or ISO
    iso: formatNumberish(meta.ISO ?? meta.ISOSpeedRatings, 'N/A'),
    // Aperture: FNumber or ApertureValue
    aperture: meta.FNumber
      ? `f/${meta.FNumber}`
      : meta.ApertureValue
        ? `f/${meta.ApertureValue}`
        : 'N/A',
    // Shutter: ExposureTime (convert to fraction if < 1)
    shutter: formatShutterSpeed(meta.ExposureTime),
    // Camera: Make + Model
    camera: [meta.Make, meta.Model].filter(Boolean).join(' ') || 'Unknown',
    // Lens: LensModel or LensMake + LensModel
    lens: meta.LensModel || (meta.LensMake ? `${meta.LensMake} ${meta.LensModel || ''}`.trim() : 'N/A'),
    // Focal length
    focalLength: meta.FocalLength ? `${meta.FocalLength}mm` : 'N/A',
    // GPS direction (compass heading)
    direction:
      meta.GPSImgDirection != null
        ? `${Math.round(toNumber(meta.GPSImgDirection, 0))}° ${getCardinalDirection(meta.GPSImgDirection)}`
        : 'N/A',
    // Hash from photo
    hash: photo.hash ? `${photo.hash.substring(0, 12)}...` : 'N/A',
    // Filename
    filename: photo.filename || photo.original_filename || 'Unknown',
  };

  // Format date nicely
  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Unknown') return 'Unknown';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#f8fafc',
        backgroundImage: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        overflowY: 'auto',
      }}
    >
      {/* Keywords Section - Editable */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Keywords
        </label>
        <textarea
          value={keywords}
          onChange={(event) => onKeywordsChange?.(event.target.value)}
          placeholder="Add keywords: nature, landscape, travel..."
          rows={3}
          style={{
            width: '100%',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '14px',
            color: '#334155',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: '1.5',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          }}
          onFocus={(event) => {
            event.target.style.borderColor = '#3b82f6';
            event.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(event) => {
            event.target.style.borderColor = '#e2e8f0';
            event.target.style.boxShadow = 'none';
          }}
        />
        {/* Display keywords as tags */}
        {keywords && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '10px',
            }}
          >
            {keywords.split(',').map((kw, idx) => {
              const trimmed = kw.trim();
              if (!trimmed) return null;
              return (
                <span
                  key={idx}
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: '9999px',
                  }}
                >
                  {trimmed}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Technical Metadata Section */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '12px',
          }}
        >
          Technical Details
        </label>

        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <MetadataRow label="Date Taken" value={formatDate(metadata.date)} />
          <MetadataRow label="Filename" value={metadata.filename} />
          <MetadataRow label="Dimensions" value={metadata.dimensions} />
          <MetadataRow label="File Size" value={metadata.size} />
          <MetadataRow label="Camera" value={metadata.camera} />
          <MetadataRow label="Lens" value={metadata.lens} />
          <MetadataRow label="Focal Length" value={metadata.focalLength} />
          <MetadataRow label="ISO" value={metadata.iso} />
          <MetadataRow label="Aperture" value={metadata.aperture} />
          <MetadataRow label="Shutter" value={metadata.shutter} />
          <MetadataRow label="Direction" value={metadata.direction} />
          <MetadataRow label="Hash" value={metadata.hash} isLast />
        </div>
      </div>
    </div>
  );
}

type MetadataRowProps = {
  label: string;
  value: string;
  isLast?: boolean;
};

/**
 * MetadataRow - A single row in the metadata table
 */
function MetadataRow({ label, value, isLast = false }: MetadataRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
      }}
    >
      <span
        style={{
          fontSize: '13px',
          color: '#64748b',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '13px',
          color: '#1e293b',
          fontWeight: 500,
          textAlign: 'right',
          maxWidth: '60%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Format file size to human readable format
 */
function formatFileSize(bytes: number | string | null | undefined) {
  const numeric = toNumber(bytes, NaN);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format shutter speed (ExposureTime) to human readable format
 * e.g., 0.001 -> "1/1000s", 2 -> "2s"
 */
function formatShutterSpeed(exposureTime: number | string | null | undefined) {
  const numeric = toNumber(exposureTime, NaN);
  if (!Number.isFinite(numeric)) return 'N/A';

  if (numeric >= 1) {
    return `${numeric}s`;
  }

  // Convert to fraction (1/x)
  const denominator = Math.round(1 / numeric);
  return `1/${denominator}s`;
}

/**
 * Convert compass degrees to cardinal direction
 */
function getCardinalDirection(degrees: number | string | null | undefined) {
  const numeric = toNumber(degrees, NaN);
  if (!Number.isFinite(numeric)) return '';

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(numeric / 45) % 8;
  return directions[index];
}

function formatNumberish(value: number | string | null | undefined, fallback: string) {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toNumber(value: number | string | null | undefined, fallback: number) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}