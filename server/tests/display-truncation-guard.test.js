const fs = require('fs');
const path = require('path');

describe('Display route truncation artifact guard', () => {
  it('must not contain literal truncation artifacts ("..." or "…")', () => {
    const displayPath = path.join(__dirname, '..', 'routes', 'display.js');
    const source = fs.readFileSync(displayPath, 'utf8');

    const hasThreeDots = source.includes('...');
    const hasEllipsis = source.includes('…');

    if (hasThreeDots || hasEllipsis) {
      const found = [
        hasThreeDots ? '"..."' : null,
        hasEllipsis ? '"…"' : null,
      ].filter(Boolean).join(' and ');

      throw new Error(
        `server/routes/display.js contains truncation artifact ${found}. ` +
          'Do not commit truncated literals in cache keys or Cache-Control directives.'
      );
    }

    expect(hasThreeDots).toBe(false);
    expect(hasEllipsis).toBe(false);
  });
});
