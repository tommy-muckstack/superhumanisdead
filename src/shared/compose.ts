import { markupToText, renderMarkup } from './format'
import { OPERATOR_HINTS } from './search'
import type { OutgoingAttachment, OutgoingMail } from './types'

/** Pure composer helpers shared by the renderer and tests. */
export interface DraftLike {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  quoted: string
  threadId?: string
  inReplyTo?: string | null
  references?: string | null
  from?: string
  attachments?: OutgoingAttachment[]
}

export function splitAddresses(value: string): string[] {
  return value.split(/[,;]/).map((entry) => entry.trim()).filter(Boolean)
}

export function draftToMail(draft: DraftLike, signature = ''): OutgoingMail {
  const markup = `${draft.body}${signature ? `\n\n${signature}` : ''}`
  const quoted = draft.quoted.replace(/^\n+/, '')
  const text = `${markupToText(markup)}${draft.quoted}`
  // Quoted history is already "> " prefixed, so it renders as a blockquote.
  const html = renderMarkup(quoted ? `${markup}\n\n${quoted}` : markup)
  return {
    to: splitAddresses(draft.to),
    cc: splitAddresses(draft.cc),
    bcc: splitAddresses(draft.bcc),
    subject: draft.subject,
    text,
    html,
    from: draft.from,
    attachments: draft.attachments?.length ? draft.attachments : undefined,
    threadId: draft.threadId,
    inReplyTo: draft.inReplyTo,
    references: draft.references,
  }
}

/** Replace the ";query" trigger that starts at `start` (and runs to `caret`) with `insert`. Returns new text and caret. */
export function replaceTrigger(text: string, start: number, caret: number, insert: string): { text: string; caret: number } {
  const next = text.slice(0, start) + insert + text.slice(caret)
  return { text: next, caret: start + insert.length }
}

/** Insert at the caret (⌘; picker). */
export function insertAt(text: string, caret: number, insert: string): { text: string; caret: number } {
  return { text: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length }
}

/** First recipient of a To field, for {first_name}. */
export function firstRecipient(to: string): { name: string; email: string } {
  const first = splitAddresses(to)[0] ?? ''
  const match = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(first)
  if (match) return { name: (match[1] ?? '').trim(), email: (match[2] ?? '').trim() }
  return { name: '', email: first }
}

/**
 * Operator hints for the search box: shows all hints for an empty last word,
 * otherwise the hints whose syntax starts with the word being typed.
 */
export function searchHints(query: string): { syntax: string; hint: string }[] {
  const last = query.split(/\s+/).pop() ?? ''
  if (!last) return OPERATOR_HINTS
  if (last.includes(':') && !last.endsWith(':')) return []
  const needle = last.replace(/^-/, '').toLowerCase()
  return OPERATOR_HINTS.filter((hint) => hint.syntax.toLowerCase().startsWith(needle) && hint.syntax.toLowerCase() !== needle)
}

/** Apply a picked hint to the query, replacing the partial last word. */
export function applyHint(query: string, syntax: string): string {
  const parts = query.split(/(\s+)/)
  const last = parts[parts.length - 1] ?? ''
  const prefix = last.startsWith('-') ? '-' : ''
  parts[parts.length - 1] = prefix + syntax
  return parts.join('')
}
