import { describe, expect, it } from 'vitest'
import { base64Url } from './mime'
import { extractBody, htmlToText, parseThread, summariseThread, type GmailThread } from './gmail-parse'

const thread: GmailThread = {
  id: 't1',
  messages: [
    {
      id: 'm1',
      threadId: 't1',
      labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
      snippet: 'Hi &amp; hello',
      internalDate: '1700000000000',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'Ada <ada@example.com>' },
          { name: 'To', value: 'me@example.com' },
          { name: 'Subject', value: 'Plans' },
          { name: 'Message-ID', value: '<one@example.com>' },
        ],
        parts: [
          { mimeType: 'text/plain', body: { data: base64Url('plain body') } },
          { mimeType: 'text/html', body: { data: base64Url('<p>html <b>body</b></p>') } },
          { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att1', size: 12 } },
        ],
      },
    },
    {
      id: 'm2',
      threadId: 't1',
      labelIds: ['SENT'],
      snippet: 'reply',
      internalDate: '1700000001000',
      payload: {
        headers: [
          { name: 'From', value: 'me@example.com' },
          { name: 'To', value: 'Ada <ada@example.com>' },
          { name: 'Subject', value: 'Re: Plans' },
        ],
        mimeType: 'text/plain',
        body: { data: base64Url('ok') },
      },
    },
  ],
}

describe('thread summary', () => {
  it('summarises the thread from the perspective of me', () => {
    const summary = summariseThread(thread, 'me@example.com')
    expect(summary.subject).toBe('Plans')
    expect(summary.participants.map((address) => address.email)).toEqual(['ada@example.com'])
    expect(summary.unread).toBe(true)
    expect(summary.messageCount).toBe(2)
    expect(summary.lastDate).toBe(1700000001000)
    expect(summary.snippet).toBe('reply')
    expect(summary.labelIds).toContain('CATEGORY_PERSONAL')
  })
})

describe('bodies', () => {
  it('extracts text, html, attachments and message id', () => {
    const body = extractBody(thread.messages?.[0]?.payload)
    expect(body.text).toBe('plain body')
    expect(body.html).toContain('<b>body</b>')
    expect(body.attachments[0]?.filename).toBe('a.pdf')
    expect(body.messageId).toBe('<one@example.com>')
  })
  it('parses the full thread', () => {
    const full = parseThread(thread, 'me@example.com')
    expect(full.messages[1]?.body.text).toBe('ok')
  })
  it('turns html into readable text', () => {
    expect(htmlToText('<style>x{}</style><p>Hello<br>there &amp; you</p>')).toBe('Hello\nthere & you')
  })
})
