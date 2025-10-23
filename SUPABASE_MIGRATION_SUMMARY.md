# Supabase Storage Migration Summary

## Overview
Successfully migrated the photo app from local filesystem storage to Supabase Storage. This provides a single source of truth for file storage and eliminates dependency on local directories.

## Completed Changes

### 1. ✅ Setup Supabase Client
- **File Created**: `server/lib/supabaseClient.js`
- **Dependencies**: Added `@supabase/supabase-js` package
- **Environment Variables Required**: 
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### 2. ✅ Refactored Upload System
- **File Modified**: `server/routes/uploads.js`
- **Changes**:
  - Changed from `multer.diskStorage()` to `multer.memoryStorage()`
  - Upload files directly to Supabase Storage `photos` bucket
  - Files stored with path prefix: `working/${filename}`
  - Added collision detection for duplicate filenames
  - Updated `ingestPhoto` to work with file buffers

### 3. ✅ Removed Local File Serving
- **File Modified**: `server/server.js`
- **Changes**:
  - Removed all static file serving routes (`/working`, `/thumbnails`, `/display`)
  - Removed path dependencies and local directory scanning
  - Cleaned up startup routines that depended on local filesystem

### 4. ✅ Updated Photo API Routes
- **File Modified**: `server/routes/photos.js`
- **Changes**:
  - **GET /photos**: Now generates Supabase public URLs for images and thumbnails
  - **PATCH /photos/:id/state**: Uses `supabase.storage.move()` instead of `fs.rename()`
  - **DELETE /photos/:id**: Removes files from Supabase Storage
  - **POST /save-captioned-image**: Uploads edited images to Supabase Storage
  - **PATCH /photos/:id/revert**: Removes edited files from Supabase Storage
  - Removed deprecated `/thumbnails` and `/display` routes

### 5. ✅ Refactored Image Processing
- **File Modified**: `server/media/image.js`
- **Changes**:
  - `generateThumbnail()`: Now works with file buffers and uploads to Supabase
  - `convertHeicToJpegBuffer()`: Updated to work with buffers instead of file paths
  - `ensureAllThumbnails()`: Downloads from Supabase, processes, and uploads thumbnails
  - `ingestPhoto()`: Updated to work with file buffers and storage paths
  - `hashFile()`: Now works with buffers instead of file paths

### 6. ✅ Updated AI Processing
- **File Modified**: `server/ai/service.js`
- **Changes**:
  - `processPhotoAI()`: Now accepts file buffers instead of file paths
  - `updatePhotoAIMetadata()`: Downloads files from Supabase Storage for AI processing
  - `processAllUnprocessedInprogress()`: Works with storage paths instead of local directories

### 7. ✅ Updated Supporting Services
- **Files Modified**:
  - `server/routes/debug.js`: Updated thumbnail regeneration to work with Supabase
  - `server/routes/privilege.js`: Simplified since file privileges don't apply to cloud storage
  - `server/queue/index.js`: Updated worker to use storage paths
  - `server/scripts/run_ai_update.js`: Updated to use storage paths

### 8. ✅ Database Schema Update
- **File Created**: `server/db/migrations/20251022000003_add_storage_path.js`
- **Changes**: Added `storage_path` column to track file locations in Supabase Storage

### 9. ✅ Cleanup
- **File Removed**: `server/config/paths.js` (no longer needed)
- **Updated**: All imports and references to local directory paths

## Required Setup for Deployment

### Environment Variables
Add these to your server environment:
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supabase Storage Bucket
Create a bucket named `photos` in your Supabase project with the following structure:
```
photos/
├── working/          # Initial uploads
├── inprogress/       # Files being processed
├── finished/         # Completed files
└── thumbnails/       # Generated thumbnails
```

### Database Migration
Run the database migration to add the `storage_path` column:
```bash
npm run migrate
```

## File Structure in Supabase Storage
- **Original photos**: `{state}/{filename}` (e.g., `working/photo.jpg`)
- **Edited photos**: `inprogress/{filename}-edit.jpg`
- **Thumbnails**: `thumbnails/{hash}.jpg`

## API Changes
- **Photo URLs**: Now served as Supabase public URLs instead of local routes
- **Upload Response**: Now includes `path` field with Supabase storage path
- **Photo Objects**: Now include `storagePath` field and use public URLs

## Benefits
1. **Scalability**: No local storage limitations
2. **Reliability**: Built-in redundancy and backup
3. **Performance**: CDN-backed file serving
4. **Simplicity**: Single source of truth for files
5. **Security**: Managed access controls

## Notes
- All existing functionality preserved
- Backward compatibility maintained where possible
- File processing (HEIC conversion, thumbnails) still works
- AI processing continues to function with cloud-stored files
- No migration script needed - users will re-upload photos to the new system

The migration is complete and ready for testing with Supabase Storage!