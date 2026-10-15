import { parseThread, summariseThread, type GmailThread } from '@shared/gmail-parse'
import { base64Url, buildRawMessage } from '@shared/mime'
import { queryForSplit } from '@shared/splits'
import type { Label, OutgoingMail, Split, Thread, ThreadSummary } from '@shared/types'
import { DEMO_EMAIL, demo } from './demo'
import { MUTED_LABEL } from '@shared/labels'

const isDemo = (me: string): boolean => me === DEMO_EMAIL

const PAGE_SIZE = 40
const CONCURRENCY = 8
const LIST_HEADERS = ['From', 'To', 'Subject', 'Date']

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      const item = items[index]
      if (item === undefined) return
      results[index] = await fn(item)
    }
  })
  await Promise.all(workers)
  return results
}

export interface Page {
  threads: ThreadSummary[]
  nextPageToken?: string
}

export async function listThreads(split: Split, me: string, pageToken?: string, search?: string): Promise<Page> {
  if (isDemo(me)) return demo.listThreads(split, search)
  const base = queryForSplit(split)
  const q = [base.q, search].filter(Boolean).join(' ')
  const listing = await window.duper.gmail.request<{ threads?: { id: string }[]; nextPageToken?: string }>('threads', {
    query: { maxResults: String(PAGE_SIZE), labelIds: base.labelIds, q: q || undefined, pageToken },
  })
  const ids = (listing.threads ?? []).map((thread) => thread.id)
  const threads = await mapLimit(ids, CONCURRENCY, (id) =>
    window.duper.gmail
      .request<GmailThread>(`threads/${id}`, { query: { format: 'metadata', metadataHeaders: LIST_HEADERS } })
      .then((thread) => summariseThread(thread, me)),
  )
  return { threads, nextPageToken: listing.nextPageToken }
}

export async function summariesFor(ids: string[], me: string): Promise<ThreadSummary[]> {
  const threads = await mapLimit(ids, CONCURRENCY, async (id) => {
    try {
      const thread = await window.duper.gmail.request<GmailThread>(`threads/${id}`, { query: { format: 'metadata', metadataHeaders: LIST_HEADERS } })
      return summariseThread(thread, me)
    } catch {
      return null
    }
  })
  return threads.filter((thread): thread is ThreadSummary => thread !== null)
}

export async function getThread(id: string, me: string): Promise<Thread> {
  if (isDemo(me)) return demo.getThread(id)
  const thread = await window.duper.gmail.request<GmailThread>(`threads/${id}`, { query: { format: 'full' } })
  return parseThread(thread, me)
}

export function modifyThread(id: string, add: string[], remove: string[]): Promise<void> {
  if (id.startsWith('d') && window.duperDemo) {
    demo.modify(id, add, remove)
    return Promise.resolve()
  }
  return window.duper.gmail.request(`threads/${id}/modify`, {
    method: 'POST',
    body: { addLabelIds: add.length ? add : undefined, removeLabelIds: remove.length ? remove : undefined },
  })
}

export function archive(id: string): Promise<void> {
  return modifyThread(id, [], ['INBOX'])
}

export function unarchive(id: string): Promise<void> {
  return modifyThread(id, ['INBOX'], [])
}

export function setStarred(id: string, starred: boolean): Promise<void> {
  return starred ? modifyThread(id, ['STARRED'], []) : modifyThread(id, [], ['STARRED'])
}

export function setUnread(id: string, unread: boolean): Promise<void> {
  return unread ? modifyThread(id, ['UNREAD'], []) : modifyThread(id, [], ['UNREAD'])
}

export function trash(id: string): Promise<void> {
  if (id.startsWith('d') && window.duperDemo) return modifyThread(id, ['TRASH'], ['INBOX'])
  return window.duper.gmail.request(`threads/${id}/trash`, { method: 'POST' })
}

export function untrash(id: string): Promise<void> {
  if (id.startsWith('d') && window.duperDemo) return modifyThread(id, ['INBOX'], ['TRASH'])
  return window.duper.gmail.request(`threads/${id}/untrash`, { method: 'POST' }).then(() => modifyThread(id, ['INBOX'], []))
}

export function spam(id: string): Promise<void> {
  return modifyThread(id, ['SPAM'], ['INBOX'])
}

export function unspam(id: string): Promise<void> {
  return modifyThread(id, ['INBOX'], ['SPAM'])
}

export async function send(mail: OutgoingMail, from: string): Promise<{ id: string; threadId: string }> {
  if (isDemo(from)) {
    demo.send(mail)
    return { id: 'demo', threadId: mail.threadId ?? 'demo' }
  }
  const raw = base64Url(buildRawMessage(mail, from))
  return window.duper.gmail.request('messages/send', { method: 'POST', body: { raw, threadId: mail.threadId } })
}

export async function saveDraft(mail: OutgoingMail, from: string): Promise<{ id: string }> {
  const raw = base64Url(buildRawMessage(mail, from))
  return window.duper.gmail.request('drafts', { method: 'POST', body: { message: { raw, threadId: mail.threadId } } })
}

export async function listLabels(me: string): Promise<Label[]> {
  if (isDemo(me)) return [...demo.labels]
  const response = await window.duper.gmail.request<{ labels?: { id: string; name: string; type: string }[] }>('labels')
  return (response.labels ?? []).map((label) => ({ id: label.id, name: label.name, type: label.type === 'user' ? 'user' : 'system' }))
}

export async function createLabel(me: string, name: string): Promise<Label> {
  if (isDemo(me)) return demo.addLabel(name)
  const label = await window.duper.gmail.request<{ id: string; name: string }>('labels', {
    method: 'POST',
    body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  })
  return { id: label.id, name: label.name, type: 'user' }
}

/** Find or create the label that marks muted conversations. */
export async function mutedLabel(me: string, labels: Label[]): Promise<Label> {
  return labels.find((label) => label.name === MUTED_LABEL) ?? createLabel(me, MUTED_LABEL)
}

export interface SendAs {
  email: string
  name: string
  isDefault: boolean
}

export async function listSendAs(me: string): Promise<SendAs[]> {
  if (isDemo(me)) return [{ email: me, name: 'You', isDefault: true }, { email: 'tommy@muckstack.demo', name: 'Tommy (MuckStack)', isDefault: false }]
  const response = await window.duper.gmail.request<{ sendAs?: { sendAsEmail: string; displayName?: string; isDefault?: boolean }[] }>('settings/sendAs')
  return (response.sendAs ?? []).map((alias) => ({ email: alias.sendAsEmail, name: alias.displayName ?? '', isDefault: Boolean(alias.isDefault) }))
}

export async function downloadAttachment(me: string, messageId: string, attachmentId: string): Promise<string> {
  if (isDemo(me)) return btoa('Demo attachment contents')
  return window.duper.gmail.attachment(messageId, attachmentId)
}
