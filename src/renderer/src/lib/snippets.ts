import { STARTER_SNIPPETS, type Snippet } from '@shared/snippets'

const KEY = 'superhumanisdead.snippets'

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Snippet[]
  } catch {
    // fall through to the starters
  }
  const seeded = STARTER_SNIPPETS.map((snippet, index) => ({ ...snippet, id: `starter-${index}`, sends: 0, updatedAt: Date.now() }))
  saveSnippets(seeded)
  return seeded
}

export function saveSnippets(snippets: Snippet[]): void {
  localStorage.setItem(KEY, JSON.stringify(snippets))
}

export function bumpSnippet(id: string): void {
  saveSnippets(loadSnippets().map((snippet) => (snippet.id === id ? { ...snippet, sends: snippet.sends + 1 } : snippet)))
}
