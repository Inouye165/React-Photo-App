/**
 * Collectible type definitions
 * Phase 1: Minimal types for EditPage TypeScript conversion
 */

export interface CollectibleRecord {
  id?: number | string;
  photo_id: number | string;
  category?: string;
  name?: string;
  conditionLabel?: string;
  valueMin?: number;
  valueMax?: number;
  specifics?: CollectibleSpecifics;
  user_notes?: string;
  ai_analysis?: CollectibleAiAnalysis;
  created_at?: string;
  updated_at?: string;
}

export interface CollectibleFormState {
  category?: string;
  name?: string;
  conditionLabel?: string;
  valueMin?: number;
  valueMax?: number;
  specifics?: CollectibleSpecifics;
}

export interface CollectibleSpecifics {
  [key: string]: string | number | boolean | undefined | null;
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
  [key: string]: unknown;
}
