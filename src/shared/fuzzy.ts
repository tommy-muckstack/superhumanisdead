/**
 * Command palette matcher. Prefix and word-start matches rank above scattered
 * subsequence matches, the way Superhuman Command behaves ("rem" → Remind Me,
 * "md" → Mark Done).
 */
export interface Scored<T> {
  item: T
  score: number
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 1
  if (t === q) return 1000
  if (t.startsWith(q)) return 900 - t.length
  const words = t.split(/[\s:/()\-–]+/).filter(Boolean)
  if (words.some((word) => word.startsWith(q))) return 800 - t.length
  const initials = words.map((word) => word[0]).join('')
  if (initials.startsWith(q)) return 700 - t.length
  const at = t.indexOf(q)
  if (at >= 0) return 600 - at - t.length
  // Subsequence, rewarding consecutive runs and word starts.
  let score = 0
  let ti = 0
  let run = 0
  for (const char of q) {
    const found = t.indexOf(char, ti)
    if (found < 0) return 0
    const wordStart = found === 0 || /[\s:/()\-]/.test(t[found - 1] ?? '')
    run = found === ti ? run + 1 : 0
    score += 10 + run * 5 + (wordStart ? 15 : 0) - Math.min(found - ti, 10)
    ti = found + 1
  }
  return Math.max(1, Math.min(score, 499))
}

export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string | string[], limit = 50): T[] {
  if (!query.trim()) return items.slice(0, limit)
  const scored: Scored<T>[] = []
  for (const item of items) {
    const fields = text(item)
    const best = Math.max(...(Array.isArray(fields) ? fields : [fields]).map((field) => fuzzyScore(query, field)))
    if (best > 0) scored.push({ item, score: best })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.item)
}
