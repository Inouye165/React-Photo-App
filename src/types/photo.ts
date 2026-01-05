/**
 * Photo type definitions
 * Phase 1: Minimal types for EditPage TypeScript conversion
 */

export interface Photo {
  id: number | string;
  url: string;
  user_id?: string;
  filename?: string;
  caption?: string;
  description?: string;
  keywords?: string;
  textStyle?: TextStyle | null;
  hash?: string;
  updated_at?: string;
  created_at?: string;
  taken_at?: string;
  file_size?: number;
  classification?: string;
  // Note: store-level AI polling can mark a photo as 'error' on hard timeout.
  state?: 'working' | 'inprogress' | 'finished' | 'error';
  
  // AI analysis fields
  ai_analysis?: {
    classification?: string;
    collectibleInsights?: CollectibleAiAnalysis;
    [key: string]: unknown;
  };
  
  // POI/Collectible analysis (alternative location)
  poi_analysis?: CollectibleAiAnalysis;
  collectible_insights?: CollectibleAiAnalysis;
  
  // Metadata from EXIF (parsed JSON from exifr)
  metadata?: ExifMetadata;
  
  // GPS coordinates
  latitude?: number;
  longitude?: number;
}

export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  color?: string;
  backgroundColor?: string;
  position?: {
    x: number;
    y: number;
  };
  [key: string]: unknown;
}

export interface ExifMetadata {
  DateTimeOriginal?: string;
  CreateDate?: string;
  ModifyDate?: string;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  ISO?: number;
  ISOSpeedRatings?: number;
  FNumber?: number;
  ApertureValue?: number;
  ExposureTime?: number;
  Make?: string;
  Model?: string;
  LensModel?: string;
  LensMake?: string;
  FocalLength?: number;
  GPSImgDirection?: number;
  [key: string]: unknown;
}

export interface CollectibleAiAnalysis {
  category?: string;
  name?: string;
  condition?: string;
  estimatedValue?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  confidence?: number;
  notes?: string;
  // HITL gate fields
  identification?: {
    id?: string;
    category?: string;
    confidence?: number;
    fields?: Record<string, unknown>;
    source?: 'ai' | 'human';
  };
  visualMatches?: Array<{
    title: string;
    link: string;
    thumbnail?: string;
    source?: string;
  }>;
  review?: {
    status?: 'pending' | 'confirmed' | 'rejected';
    ticketId?: string;
    confidence?: number;
  };
  [key: string]: unknown;
}
