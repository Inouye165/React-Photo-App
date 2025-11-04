export type ModelId =
  | "gpt-4o-mini"     // vision: yes
  | "gpt-4o"          // vision: yes
  | "o4-mini"         // vision+reasoning (if enabled)
  | "o3-mini"         // vision+reasoning (if enabled)
  | "gpt-image-1";    // image generation/editing (image OUT)

export interface ModelInfo {
  id: ModelId;
  label: string;
  vision: boolean;
  reasoning: boolean;
  imageGen: boolean;
  // Relative UI hints: 1=low, 2=med, 3=high
  cost: 1 | 2 | 3;
  speed: 1 | 2 | 3;
  quality: 1 | 2 | 3;
  help: string;
  available?: boolean;
}

export const MODEL_CATALOG: Record<ModelId, ModelInfo> = {
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    label: "GPT-4o-mini (vision)",
    vision: true, reasoning: false, imageGen: false,
    cost: 1, speed: 3, quality: 2,
    help: "Cheapest + fast; great for bulk captions/tags/OCR-ish."
  },
  "gpt-4o": {
    id: "gpt-4o",
    label: "GPT-4o (vision)",
    vision: true, reasoning: false, imageGen: false,
    cost: 3, speed: 2, quality: 3,
    help: "Higher-quality vision + more reliable JSON."
  },
  "o4-mini": {
    id: "o4-mini",
    label: "o4-mini (vision + reasoning)",
    vision: true, reasoning: true, imageGen: false,
    cost: 2, speed: 2, quality: 3,
    help: "Reasoning-optimized; multi-step visual deductions."
  },
  "o3-mini": {
    id: "o3-mini",
    label: "o3-mini (vision + reasoning)",
    vision: true, reasoning: true, imageGen: false,
    cost: 3, speed: 1, quality: 3,
    help: "Deeper reasoning; slower/pricier—use as second pass."
  },
  "gpt-image-1": {
    id: "gpt-image-1",
    label: "GPT-Image-1 (image generation)",
    vision: true, reasoning: false, imageGen: true,
    cost: 2, speed: 2, quality: 3,
    help: "Generates/edits images; use 4o/4o-mini for analysis text."
  }
};

export const DEFAULT_MODEL: ModelId = 'gpt-4o-mini';
