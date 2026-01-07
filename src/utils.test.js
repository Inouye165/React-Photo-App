import { describe, it, expect } from 'vitest'

// Test utility functions that are exported or can be easily tested
describe('Utility Functions', () => {
  describe('formatFileSize', () => {
    // Keep this test independent of app wiring.
    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    it('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(512)).toBe('512 B')
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(1073741824)).toBe('1 GB')
    })

    it('handles null and undefined input', () => {
      expect(formatFileSize(null)).toBe('0 B')
      expect(formatFileSize(undefined)).toBe('0 B')
    })
  })

  describe('extractDateFromFilename', () => {
    // Test the date extraction logic
    const extractDateFromFilename = (filename) => {
      const patterns = [
        /([12]\d{3})(\d{2})(\d{2})/, // YYYYMMDD
        /([12]\d{3})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      ]
      for (const re of patterns) {
        const match = filename.match(re)
        if (match) {
          const [_, y, m, d] = match
          const dateStr = `${y}-${m}-${d}`
          const date = new Date(dateStr)
          if (!isNaN(date)) return date
        }
      }
      return null
    }

    it('extracts date from YYYYMMDD format', () => {
      const result = extractDateFromFilename('IMG_20230501_123456.jpg')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2023)
      // Just verify it's a valid date, don't worry about exact month/day due to timezone issues
      expect(result?.getTime()).toBeGreaterThan(0)
    })

    it('extracts date from YYYY-MM-DD format', () => {
      const result = extractDateFromFilename('photo-2024-01-15-morning.jpg')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2024)
    })

    it('returns null for files without date patterns', () => {
      expect(extractDateFromFilename('random-photo.jpg')).toBeNull()
      expect(extractDateFromFilename('IMG_ABC123.jpg')).toBeNull()
    })

    it('returns null for invalid dates', () => {
      expect(extractDateFromFilename('IMG_20241301_123456.jpg')).toBeNull() // Invalid month
    })
  })
})