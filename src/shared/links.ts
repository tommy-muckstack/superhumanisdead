import { htmlToText } from './gmail-parse'
import type { FullMessage, Thread } from './types'

export interface LinkItem {
  kind: 'link' | 'attachment'
  label: string
  url?: string
  attachmentId?: string
  messageId?: string
  filename?: string
}

/** Links (html anchors and bare URLs in text) and attachments in a message, deduped, in reading order. */
export function extractLinks(message: FullMessage, limit = 30): LinkItem[] {
  const items: LinkItem[] = []
  const seen = new Set<string>()
  const add = (url: string, label: string) => {
    const clean = url.replace(/[).,;]+$/, '')
    if (!/^(https?:\/\/|mailto:)/i.test(clean) || seen.has(clean)) return
    seen.add(clean)
    items.push({ kind: 'link', label: label.trim() || clean, url: clean })
  }
  const html = message.body.html
  if (html) {
    for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      add((match[1] ?? '').replace(/&amp;/g, '&'), htmlToText(match[2] ?? '').replace(/\s+/g, ' '))
    }
  } else {
    for (const match of (message.body.text ?? '').matchAll(/https?:\/\/[^\s<>"]+/g)) add(match[0], '')
  }
  for (const attachment of message.body.attachments) {
    items.push({ kind: 'attachment', label: `${attachment.filename} (${Math.max(1, Math.round(attachment.size / 1024))} KB)`, attachmentId: attachment.attachmentId, messageId: message.id, filename: attachment.filename })
  }
  return items.slice(0, limit)
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A static, script-free document for printing a conversation. */
export function printableThread(thread: Thread, textOf: (message: FullMessage) => string): string {
  const messages = thread.messages
    .map((message) => {
      const when = new Date(message.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      return `<section><div class="h"><b>${esc(message.from.name)}</b> &lt;${esc(message.from.email)}&gt;<br>To: ${esc(message.to.map((a) => a.email).join(', '))} · ${esc(when)}</div><pre>${esc(textOf(message))}</pre></section>`
    })
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>${esc(thread.subject)}</title><style>body{font:13px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px}section{border-top:1px solid #ccc;padding:12px 0}.h{color:#444;margin-bottom:8px}pre{white-space:pre-wrap;font:inherit;margin:0}</style><h1>${esc(thread.subject)}</h1>${messages}`
}
