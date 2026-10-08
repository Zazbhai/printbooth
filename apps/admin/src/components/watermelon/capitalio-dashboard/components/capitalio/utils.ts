export function toneColor(tone: 'positive' | 'negative' | 'neutral') {
  if (tone === 'positive') {
    return 'var(--chart-4)'
  }

  if (tone === 'negative') {
    return 'var(--destructive)'
  }

  return 'var(--foreground)'
}
