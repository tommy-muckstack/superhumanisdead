import { decodeBase64Url, parseAddress, parseAddressList } from './mime'
import type { Address, FullMessage, MessageBody, MessageSummary, Thread, ThreadSummary } from './types'

interface GmailHeader {
  name: string
  value: string
}

export interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart
}

export interface GmailThread {
  id: string
  snippet?: string
  historyId?: string
  messages?: GmailMessage[]
}

function header(part: GmailPart | undefined, name: string): string | undefined {
  const lower = name.toLowerCase()
  return part?.headers?.find((entry) => entry.name.toLowerCase() === lower)?.value
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export function summariseMessage(message: GmailMessage): MessageSummary {
  const payload = message.payload
  const labelIds = message.labelIds ?? []
  return {
    id: message.id,
    threadId: message.threadId,
    from: parseAddress(header(payload, 'From') ?? ''),
    to: parseAddressList(header(payload, 'To')),
    cc: parseAddressList(header(payload, 'Cc')),
    subject: header(payload, 'Subject') ?? '(no subject)',
    snippet: decodeEntities(message.snippet ?? ''),
    date: Number(message.internalDate ?? 0),
    labelIds,
    unread: labelIds.includes('UNREAD'),
    starred: labelIds.includes('STARRED'),
  }
}

export function extractBody(payload: GmailPart | undefined): MessageBody {
  const body: MessageBody = {
    html: null,
    text: null,
    messageId: header(payload, 'Message-ID') ?? header(payload, 'Message-Id') ?? null,
    references: header(payload, 'References') ?? null,
    attachments: [],
  }
  const visit = (part: GmailPart | undefined): void => {
    if (!part) return
    const mime = (part.mimeType ?? '').toLowerCase()
    if (part.filename && part.body?.attachmentId) {
      body.attachments.push({
        filename: part.filename,
        mimeType: mime,
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      })
    } else if (mime === 'text/html' && part.body?.data && body.html === null) {
      body.html = decodeBase64Url(part.body.data)
    } else if (mime === 'text/plain' && part.body?.data && body.text === null) {
      body.text = decodeBase64Url(part.body.data)
    }
    part.parts?.forEach(visit)
  }
  visit(payload)
  return body
}

export function parseFullMessage(message: GmailMessage): FullMessage {
  return { ...summariseMessage(message), body: extractBody(message.payload) }
}

function uniqueParticipants(messages: MessageSummary[], me: string): Address[] {
  const seen = new Map<string, Address>()
  for (const message of messages) {
    for (const address of [message.from, ...message.to]) {
      if (!address.email || seen.has(address.email)) continue
      seen.set(address.email, address)
    }
  }
  const others = [...seen.values()].filter((address) => address.email !== me.toLowerCase())
  return others.length ? others : [...seen.values()]
}

export function summariseThread(thread: GmailThread, me: string): ThreadSummary {
  const messages = (thread.messages ?? []).map(summariseMessage)
  const last = messages[messages.length - 1]
  const first = messages[0]
  const labelIds = new Set<string>()
  messages.forEach((message) => message.labelIds.forEach((label) => labelIds.add(label)))
  return {
    id: thread.id,
    subject: first?.subject ?? '(no subject)',
    snippet: last?.snippet ?? decodeEntities(thread.snippet ?? ''),
    participants: uniqueParticipants(messages, me),
    lastDate: last?.date ?? 0,
    messageCount: messages.length,
    unread: messages.some((message) => message.unread),
    starred: messages.some((message) => message.starred),
    labelIds: [...labelIds],
  }
}

export function parseThread(thread: GmailThread, me: string): Thread {
  return { ...summariseThread(thread, me), messages: (thread.messages ?? []).map(parseFullMessage) }
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function messageText(message: FullMessage): string {
  if (message.body.text) return message.body.text.trim()
  if (message.body.html) return htmlToText(message.body.html)
  return message.snippet
}
