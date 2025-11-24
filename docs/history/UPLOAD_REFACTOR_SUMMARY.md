# Upload Scalability Refactor Summary

## Problem
The previous upload implementation used `multer.memoryStorage()`, which buffered the entire file into RAM before uploading to Supabase. This posed a significant risk of Out-Of-Memory (OOM) crashes under load or with large files.

## Solution
We refactored the upload process to use a streaming approach backed by temporary disk storage.

### Key Changes

1.  **`server/routes/uploads.js`**:
    *   Switched from `multer.memoryStorage()` to `multer.diskStorage()` (using `os.tmpdir()`).
    *   The file is now saved to a temporary local path first.
    *   The upload loop now creates a `fs.createReadStream()` from the temporary file for each upload attempt to Supabase.
    *   This allows retrying uploads (for the atomic duplicate check) without holding the file in RAM.
    *   Added `duplex: 'half'` to Supabase upload options to support Node.js streams.
    *   Added robust cleanup (`fs.unlink`) in a `finally` block to ensure temporary files are deleted.

2.  **`server/media/image.js`**:
    *   Refactored `ingestPhoto`, `hashFile`, `generateThumbnail`, and `convertHeicToJpegBuffer` to accept either a `Buffer` or a file path string.
    *   Updated `hashFile` to stream the file from disk when a path is provided, calculating the hash without loading the full file into memory.
    *   Updated `ingestPhoto` to calculate file size using `fs.stat` when a path is provided.

### Benefits
*   **Scalability**: Server RAM usage is now independent of upload file size.
*   **Reliability**: Preserved the "Race Condition" fix (atomic loop) by keeping the file available on disk for retries.
*   **Performance**: Streaming uploads to Supabase reduces time-to-first-byte latency compared to buffering.

## Verification
*   Uploads should now work for files larger than available RAM (up to the configured `UPLOAD_MAX_BYTES`).
*   Duplicate filenames are still handled correctly by the retry loop.
*   Temporary files are cleaned up automatically.
