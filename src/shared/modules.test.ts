import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore } from './fuzzy'
import { parseSearch, toGmailQuery, matchThread, highlightTerms } from './search'
import { expandSnippet, firstName, lastName, missingVariables, inlineTrigger } from './snippets'
import { dueSends, shouldRemind, sendLaterPresets, type ScheduledSend } from './schedule'
import { injectPixel, pixelUrl, summarizeOpens, deviceKind, newToken } from './read-status'
import { fromGoogle, layoutDay, freeSlots, type CalEvent } from './calendar'
import { buildRequest, parseResponse, SseDecoder } from './ai-provider'
import { parseInstantReplies, parseWritten, parseLabels, systemPrompt } from './ai-prompts'
import type { ThreadSummary } from './types'

describe('fuzzy', () => {
  it('scores subsequences and rejects non-matches', () => {
    expect(fuzzyScore('ar', 'Archive')).toBeGreaterThan(0)
    expect(fuzzyScore('xz', 'Archive')).toBeLessThanOrEqual(0)
  })
  it('ranks prefix matches first', () => {
    const items = ['Mark as read', 'Remind me', 'Reply all']
    expect(fuzzyFilter('re', items, (s) => s)[0]).not.toBe('Mark as read')
  })
})

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: 't1', subject: 'Q3 board deck', snippet: 'draft attached', participants: [{ name: 'Rahul Vohra', email: 'rahul@example.com' }],
  lastDate: new Date(2026, 9, 10).getTime(), messageCount: 3, unread: true, starred: false, labelIds: ['INBOX', 'HAS_ATTACHMENT'], ...over,
})

describe('search', () => {
  it('round-trips operators, phrases, negation and OR', () => {
    expect(toGmailQuery(parseSearch('from:rahul "board deck" -invoice'))).toBe('from:rahul "board deck" -invoice')
    expect(toGmailQuery(parseSearch('a OR b'))).toBe('a OR b')
  })
  it('matches locally', () => {
    const now = new Date(2026, 9, 14).getTime()
    expect(matchThread(parseSearch('from:rahul is:unread has:attachment'), thread(), now)).toBe(true)
    expect(matchThread(parseSearch('-board'), thread(), now)).toBe(false)
    expect(matchThread(parseSearch('newer_than:7d'), thread(), now)).toBe(true)
    expect(matchThread(parseSearch('before:2026/10/01'), thread(), now)).toBe(false)
  })
  it('highlights positive terms only', () => {
    expect(highlightTerms(parseSearch('deck -invoice subject:q3'))).toEqual(['deck', 'q3'])
  })
})

describe('snippets', () => {
  it('derives names', () => {
    expect(firstName('Vohra, Rahul')).toBe('Rahul')
    expect(firstName('', 'jane.doe@x.com')).toBe('Jane')
    expect(lastName('Rahul Vohra')).toBe('Vohra')
  })
  it('expands variables with fallbacks and leaves unknowns', () => {
    const out = expandSnippet('Hi {first_name}, {company|there} {unknown}', { to: { name: 'Ada Lovelace', email: 'a@x' } })
    expect(out).toBe('Hi Ada, there {unknown}')
    expect(missingVariables('Hi {first_name}')).toEqual(['first_name'])
  })
  it('detects ;trigger at the caret', () => {
    expect(inlineTrigger('hello ;cal', 10)).toEqual({ query: 'cal', start: 6 })
    expect(inlineTrigger('a;b', 3)).toBeNull()
  })
})

describe('schedule', () => {
  it('splits due and pending', () => {
    const item = (id: string, sendAt: number) => ({ id, sendAt, createdAt: 0, mail: {} }) as unknown as ScheduledSend
    const { due, pending } = dueSends([item('b', 20), item('a', 10), item('c', 99)], 50)
    expect(due.map((d) => d.id)).toEqual(['a', 'b'])
    expect(pending.map((d) => d.id)).toEqual(['c'])
  })
  it('suppresses reminders when someone replied', () => {
    expect(shouldRemind(100, [{ from: { email: 'me@x' }, date: 200 }], 'ME@x')).toBe(true)
    expect(shouldRemind(100, [{ from: { email: 'them@x' }, date: 200 }], 'me@x')).toBe(false)
  })
  it('offers presets in the future', () => {
    const now = new Date(2026, 9, 14, 10)
    for (const p of sendLaterPresets(now)) expect(p.at.getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('read status', () => {
  it('injects a pixel and summarizes opens', () => {
    expect(injectPixel('<body>hi</body>', pixelUrl('https://p.x/', 'tok'))).toContain('https://p.x/o/tok.gif" width="1"')
    const s = summarizeOpens([{ token: 't', at: 30_000 }, { token: 't', at: 200_000, userAgent: 'iPhone' }, { token: 't', at: 210_000 }, { token: 't', at: 400_000, userAgent: 'Mac' }], 0)
    expect(s.opens).toBe(2)
    expect(s.devices.map((d) => d.kind)).toEqual(['mobile', 'desktop'])
    expect(deviceKind('GoogleImageProxy')).toBe('unknown')
    expect(newToken()).toHaveLength(22)
  })
})

describe('calendar', () => {
  const day = new Date(2026, 9, 14).getTime()
  const ev = (id: string, h1: number, h2: number): CalEvent => ({ id, title: id, start: day + h1 * 3_600_000, end: day + h2 * 3_600_000, allDay: false })
  it('parses google events', () => {
    const e = fromGoogle({ id: '1', start: { date: '2026-10-14' }, end: { date: '2026-10-15' }, hangoutLink: 'https://meet' })
    expect(e.allDay).toBe(true)
    expect(e.title).toBe('(No title)')
    expect(e.meetLink).toBe('https://meet')
  })
  it('puts overlaps in columns', () => {
    const placed = layoutDay([ev('a', 9, 11), ev('b', 10, 12), ev('c', 13, 14)], day)
    expect(placed.find((p) => p.event.id === 'b')).toMatchObject({ column: 1, columns: 2 })
    expect(placed.find((p) => p.event.id === 'c')).toMatchObject({ column: 0, columns: 1, top: 780 })
  })
  it('finds free slots', () => {
    expect(freeSlots([ev('a', 10, 12)], day).map((s) => [(s.start - day) / 3_600_000, (s.end - day) / 3_600_000])).toEqual([[9, 10], [12, 17]])
  })
})

describe('ai provider', () => {
  it('builds anthropic and openai-compatible requests', () => {
    const a = buildRequest({ kind: 'anthropic', apiKey: 'k', model: '' }, { system: 's', user: 'u', maxTokens: 10, stream: false })
    expect(a.url).toBe('https://api.anthropic.com/v1/messages')
    expect(a.headers['x-api-key']).toBe('k')
    const o = buildRequest({ kind: 'openai', apiKey: 'k', model: 'grok-4', baseUrl: 'https://api.x.ai/v1/' }, { system: 's', user: 'u', maxTokens: 10, stream: true })
    expect(o.url).toBe('https://api.x.ai/v1/chat/completions')
    expect(JSON.parse(o.body).messages[0]).toEqual({ role: 'system', content: 's' })
    expect(o.headers['Authorization']).toBe('Bearer k')
  })
  it('parses responses and errors', () => {
    expect(parseResponse('anthropic', { content: [{ type: 'text', text: 'hi' }] })).toBe('hi')
    expect(parseResponse('openai', { choices: [{ message: { content: 'yo' } }] })).toBe('yo')
    expect(() => parseResponse('openai', { error: { message: 'bad key' } })).toThrow('bad key')
  })
  it('decodes split SSE streams', () => {
    const d = new SseDecoder('openai')
    const a = d.push('data: {"choices":[{"delta":{"content":"He"}}]}\n\ndata: {"choi')
    const b = d.push('ces":[{"delta":{"content":"llo"}}]}\n\ndata: [DONE]\n\n')
    expect([...a, ...b].join('')).toBe('Hello')
    expect(d.done).toBe(true)
    const an = new SseDecoder('anthropic')
    expect(an.push('event: x\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n')).toEqual(['ok'])
  })
})

describe('ai prompts', () => {
  it('parses outputs', () => {
    expect(parseInstantReplies('1. Sounds good!\n- "Thanks, will do"\n• Not this time')).toEqual(['Sounds good!', 'Thanks, will do', 'Not this time'])
    expect(parseWritten('Subject: Hi\n\nBody here')).toEqual({ subject: 'Hi', body: 'Body here' })
    expect(parseLabels('t1 urgent\nt2 bogus\n[t3] news', ['urgent', 'news'])).toEqual({ t1: 'urgent', t3: 'news' })
  })
  it('includes persona', () => {
    expect(systemPrompt({ kind: 'write', persona: 'Founder of MuckStack' })).toContain('Founder of MuckStack')
  })
})
