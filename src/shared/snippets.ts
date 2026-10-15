/**
 * Snippets: reusable text with variables, like Superhuman's {first_name}.
 * Insert with ";name" inline in the composer or the snippet picker (⌘;).
 */
export interface Snippet {
  id: string
  name: string
  subject?: string
  body: string
  to?: string
  cc?: string
  bcc?: string
  sends: number
  updatedAt: number
}

export interface SnippetContext {
  to?: { name: string; email: string }
  me?: { name: string; email: string }
  now?: Date
  extra?: Record<string, string>
}

const NAME_JUNK = /\s*\(.*?\)\s*/g

export function firstName(name: string, email = ''): string {
  const clean = name.replace(NAME_JUNK, ' ').replace(/["']/g, '').trim()
  if (clean.includes(',')) return clean.split(',')[1]?.trim().split(/\s+/)[0] ?? ''
  const first = clean.split(/\s+/)[0] ?? ''
  if (first) return first.charAt(0).toUpperCase() + first.slice(1)
  const local = email.split('@')[0] ?? ''
  const part = local.split(/[._-]/)[0] ?? ''
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : ''
}

export function lastName(name: string): string {
  const clean = name.replace(NAME_JUNK, ' ').replace(/["']/g, '').trim()
  if (clean.includes(',')) return clean.split(',')[0]?.trim() ?? ''
  const parts = clean.split(/\s+/)
  return parts.length > 1 ? (parts[parts.length - 1] ?? '') : ''
}

/** Replace {variables}. Unknown variables are left in place so the user sees them. */
export function expandSnippet(text: string, context: SnippetContext = {}): string {
  const now = context.now ?? new Date()
  const to = context.to ?? { name: '', email: '' }
  const me = context.me ?? { name: '', email: '' }
  const values: Record<string, string> = {
    first_name: firstName(to.name, to.email),
    last_name: lastName(to.name),
    name: to.name || firstName(to.name, to.email),
    email: to.email,
    my_first_name: firstName(me.name, me.email),
    my_name: me.name,
    my_email: me.email,
    date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    ...(context.extra ?? {}),
  }
  return text.replace(/\{\s*([a-z_]+)(?:\|([^}]*))?\s*\}/gi, (whole, key: string, fallback?: string) => {
    const value = values[key.toLowerCase()]
    if (value) return value
    if (fallback !== undefined) return fallback
    return whole
  })
}

/** Variables the snippet uses that the context cannot fill (shown as a warning). */
export function missingVariables(text: string, context: SnippetContext = {}): string[] {
  const expanded = expandSnippet(text, context)
  return [...expanded.matchAll(/\{\s*([a-z_]+)\s*\}/gi)].map((match) => match[1] ?? '')
}

/**
 * Detect an inline trigger at the caret: ";call" right before the caret, at a word
 * boundary. Returns the query and where it starts, or null.
 */
export function inlineTrigger(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const match = /(^|\s);([\w-]*)$/.exec(before)
  if (!match) return null
  const query = match[2] ?? ''
  return { query, start: caret - query.length - 1 }
}

export const STARTER_SNIPPETS: Omit<Snippet, 'id' | 'sends' | 'updatedAt'>[] = [
  { name: 'Call follow-up', subject: 'Following up on our call', body: 'Hi {first_name},\n\nGreat talking today! As a quick recap of what we covered:\n\n- \n\nNext steps:\n- \n\nBest,\n{my_first_name}' },
  { name: 'Schedule', body: 'Thanks {first_name}! Here are a few times that work for me:\n\n- \n- \n\nHappy to adjust if none of these work.' },
  { name: 'Decline', body: 'Hi {first_name},\n\nThanks for thinking of me. I have to pass on this one for now, but I appreciate you reaching out.\n\nBest,\n{my_first_name}' },
  { name: 'Intro', body: 'Hi {first_name},\n\nMoving you to Bcc to spare your inbox. Thanks for the intro!' },
]
