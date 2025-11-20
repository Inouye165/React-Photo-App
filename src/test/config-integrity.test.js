import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Configuration Integrity', () => {
  it('vite.config.js should not contain problematic Konva aliasing', () => {
    // The issue was caused by aliasing 'konva/lib/...' to the main 'konva' bundle.
    // This breaks react-konva which expects to import specific parts of Konva.
    // See: https://github.com/konvajs/react-konva/issues/588
    
    const configPath = path.resolve(__dirname, '../../vite.config.js');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    const hasDangerousLibAlias = /find:\s*\/konva\\\/lib\\\/\.\*\//.test(configContent);
    const hasDangerousStringAlias = configContent.includes("'konva/lib/");
    
    // We want to ensure we don't accidentally re-add the alias that breaks the app
    expect(hasDangerousLibAlias).toBe(false);
    
    if (configContent.includes('alias:')) {
        expect(hasDangerousStringAlias).toBe(false);
    }
  });
});
