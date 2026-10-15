import { describeStatus, summarizeOpens, type OpenEvent } from '@shared/read-status'

/** Tokens of mail sent with tracking on, stored locally: token -> {threadId, sentAt}. */
const KEY = 'superhumanisdead.tracked'
interface Tracked {
  threadId?: string
  sentAt: number
}

function load(): Record<string, Tracked> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Tracked>
  } catch {
    return {}
  }
}

export function trackSend(token: string, sentAt: number, threadId?: string): void {
  const all = load()
  all[token] = { sentAt, threadId }
  // Keep the newest 500 so storage stays small.
  const entries = Object.entries(all).sort((a, b) => b[1].sentAt - a[1].sentAt).slice(0, 500)
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
}

export function bindThread(token: string, threadId: string): void {
  const all = load()
  const entry = all[token]
  if (!entry) return
  all[token] = { ...entry, threadId }
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function tokensForThread(threadId: string): { token: string; sentAt: number }[] {
  return Object.entries(load())
    .filter(([, entry]) => entry.threadId === threadId)
    .map(([token, entry]) => ({ token, sentAt: entry.sentAt }))
}

/** Fetch opens for a thread's tracked messages and describe them. Returns null if the thread has none. */
export async function statusForThread(threadId: string): Promise<string | null> {
  const mine = tokensForThread(threadId)
  if (!mine.length) return null
  const opens = await window.duper.readStatus.fetch(mine.map((entry) => entry.token))
  const events: OpenEvent[] = []
  for (const { token } of mine) for (const open of opens[token] ?? []) events.push({ token, at: open.at, userAgent: open.userAgent })
  const sentAt = Math.min(...mine.map((entry) => entry.sentAt))
  return describeStatus(summarizeOpens(events, sentAt))
}
