// scripts/repo-hygiene-gps-check.cjs
// Repo hygiene guardrail: fails if tracked data/fixture files contain GPS/EXIF-like fields.
// This intentionally targets data artifacts (JSON/GeoJSON/CSV), not source code/docs.
// Usage: node scripts/repo-hygiene-gps-check.cjs

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCANNED_EXTENSIONS = new Set(['.json', '.jsonl', '.geojson', '.csv', '.tsv']);

const STRICT_KEYS = new Set(['latitude', 'longitude', 'gpslatitude', 'gpslongitude']);
const GPS_PREFIX_REGEX = /^gps[a-z0-9_]*$/i;

const DECIMAL_DEGREE_LAT_REGEX = /[-+]?\d{1,2}\.\d{4,}/;
const DECIMAL_DEGREE_LNG_REGEX = /[-+]?\d{1,3}\.\d{4,}/;

function gitLsFiles() {
  const out = execSync('git ls-files -z', { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SCANNED_EXTENSIONS.has(ext);
}

function printHit(filePath, lineNumber, reason, line) {
  const trimmed = line.trim();
  const context = trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
  console.error(`${filePath}:${lineNumber}: ${reason}: ${context}`);
}

function extractJsonishKeys(line) {
  // Extract keys in JSON-like format: "key":
  const keys = [];
  const regex = /"([^"]{1,80})"\s*:/g;
  let m;
  while ((m = regex.exec(line)) !== null) keys.push(m[1]);
  return keys;
}

function lineHasLatLonWithPrecision(line) {
  // "latitude": 12.3456 or "longitude": -123.4567
  // Require 4+ decimals to avoid placeholders like 0 or 1.
  const re = /"(latitude|longitude)"\s*:\s*([-+]?\d{1,3}\.\d{4,})/i;
  return re.test(line);
}

function lineHasGPSKey(line) {
  // "GPSLatitude": ..., "GPSLongitude": ..., or any "GPS*": ...
  const re = /"(GPS[A-Za-z0-9_]{0,80})"\s*:/;
  return re.test(line);
}

function lineHasCoordinatePairArray(line) {
  // [lat, lng] with decimal degrees.
  const re = /\[\s*([-+]?\d{1,2}\.\d{4,})\s*,\s*([-+]?\d{1,3}\.\d{4,})\s*\]/;
  return re.test(line);
}

function scanFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  const lines = text.split(/\r?\n/);
  let flagged = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (lineHasLatLonWithPrecision(line)) {
      printHit(filePath, i + 1, 'forbidden key/value (latitude/longitude)', line);
      flagged = true;
    }

    if (lineHasGPSKey(line)) {
      printHit(filePath, i + 1, 'forbidden EXIF key (GPS*)', line);
      flagged = true;
    }

    if (/"location"\s*:/i.test(line)) {
      const hasPairArray = lineHasCoordinatePairArray(line);
      const hasLatLngInside = /"location"\s*:\s*\{[^}]*"(latitude|longitude)"\s*:/i.test(line);
      const hasStringPair = /"location"\s*:\s*"\s*([-+]?\d{1,2}\.\d{4,})\s*,\s*([-+]?\d{1,3}\.\d{4,})\s*"/i.test(line);
      if (hasPairArray || hasLatLngInside || hasStringPair) {
        printHit(filePath, i + 1, 'forbidden coordinate-shaped location', line);
        flagged = true;
      }
    }

    // Adjacent pattern guard: sensitive key + lat-ish and lng-ish decimal degrees on same line
    const keys = extractJsonishKeys(line).map((k) => k.toLowerCase());
    const hasSensitiveKey = keys.some((k) => STRICT_KEYS.has(k) || GPS_PREFIX_REGEX.test(k));
    if (hasSensitiveKey) {
      const hasLat = DECIMAL_DEGREE_LAT_REGEX.test(line);
      const hasLng = DECIMAL_DEGREE_LNG_REGEX.test(line);
      if (hasLat && hasLng) {
        printHit(filePath, i + 1, 'possible GPS decimal degrees near sensitive key', line);
        flagged = true;
      }
    }
  }

  return flagged;
}

function main() {
  const files = gitLsFiles().filter(shouldScanFile);
  let failed = false;

  for (const filePath of files) {
    if (scanFile(filePath)) failed = true;
  }

  if (failed) {
    console.error('Repo hygiene check failed: GPS/EXIF-like data detected in tracked data artifacts.');
    process.exit(1);
  }

  console.log('Repo hygiene check passed.');
}

if (require.main === module) main();
