export function generateCaptionFallback(desc: string): string {
  if (!desc) return 'AI processing failed';
  const firstSentence = desc.split(/[.\n]/)[0] || desc;
  const words = firstSentence.trim().split(/\s+/).slice(0, 10);
  return words.join(' ').replace(/[,:;]$/, '');
}

export function generateKeywordsFallback(desc: string): string {
  if (!desc) return '';
  const stopwords = new Set([
    'the', 'and', 'a', 'an', 'in', 'on', 'with', 'of', 'is', 'are', 'to', 'for',
    'it', 'this', 'that', 'as', 'by', 'from', 'at', 'be', 'has', 'have', 'was',
    'were', 'or', 'but', 'its', 'their', 'they', 'image', 'images', 'shows', 'show',
  ]);
  const words = desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const items = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  return items.join(', ');
}
