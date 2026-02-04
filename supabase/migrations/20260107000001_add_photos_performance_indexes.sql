-- Migration: Add performance indexes for photos table
-- Purpose: Fix DB query timeout on GET /photos endpoint
-- Date: 2026-01-07
-- Issue: Database query timeout when fetching photos list

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
			AND c.relname = 'photos'
			AND c.relkind = 'r'
	) THEN
		-- Index for listing photos by user (most common query)
		-- Supports: WHERE user_id = ? ORDER BY created_at DESC, id DESC
		CREATE INDEX IF NOT EXISTS idx_photos_user_created_id
		ON photos (user_id, created_at DESC, id DESC);

		-- Index for filtering by state (common for dashboard views)
		-- Supports: WHERE user_id = ? AND state = ? ORDER BY created_at DESC, id DESC
		CREATE INDEX IF NOT EXISTS idx_photos_user_state_created
		ON photos (user_id, state, created_at DESC, id DESC);

		-- Index for cursor-based pagination queries
		-- Supports: WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
		CREATE INDEX IF NOT EXISTS idx_photos_pagination
		ON photos (user_id, created_at DESC, id DESC)
		WHERE user_id IS NOT NULL;

		-- Index for hash lookups (deduplication on upload)
		-- Supports: WHERE hash = ?
		CREATE INDEX IF NOT EXISTS idx_photos_hash
		ON photos (hash)
		WHERE hash IS NOT NULL;

		-- Add comment for documentation
		COMMENT ON INDEX idx_photos_user_created_id IS 'Performance index for photo listing by user';
		COMMENT ON INDEX idx_photos_user_state_created IS 'Performance index for photo listing by user and state';
		COMMENT ON INDEX idx_photos_pagination IS 'Performance index for cursor-based pagination';
		COMMENT ON INDEX idx_photos_hash IS 'Performance index for photo deduplication';
	END IF;
END $$;
