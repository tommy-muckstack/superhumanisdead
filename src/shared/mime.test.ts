import { describe, expect, it } from 'vitest'
import { base64Url, buildRawMessage, decodeBase64Url, parseAddress, parseAddressList, quoteForReply } from './mime'

describe('addresses', () => {
  it('parses name and email', () => {
    expect(parseAddress('"Ada Lovelace" <ada@example.com>')).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' })
    expect(parseAddress('ada@example.com')).toEqual({ name: 'ada@example.com', email: 'ada@example.com' })
  })
  it('splits a list with quoted commas', () => {
    const list = parseAddressList('"Lovelace, Ada" <ada@example.com>, bob@example.com')
    expect(list.map((address) => address.email)).toEqual(['ada@example.com', 'bob@example.com'])
    expect(list[0]?.name).toBe('Lovelace, Ada')
  })
})

describe('raw message', () => {
  it('builds a plain text reply with threading headers', () => {
    const raw = buildRawMessage(
      { to: ['ada@example.com'], cc: [], bcc: [], subject: 'Re: Hi', text: 'Hello', inReplyTo: '<a@b>', references: '<a@b>' },
      'me@example.com',
    )
    expect(raw).toContain('To: ada@example.com')
    expect(raw).toContain('In-Reply-To: <a@b>')
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(decodeBase64Url(base64Url(raw))).toBe(raw)
  })
  it('encodes non-ascii subjects', () => {
    const raw = buildRawMessage({ to: ['a@b.c'], cc: [], bcc: [], subject: 'Café', text: 'x' }, 'me@b.c')
    expect(raw).toContain('Subject: =?UTF-8?B?')
  })
  it('quotes the previous message', () => {
    const quoted = quoteForReply('line one\nline two', { name: 'Ada', email: 'ada@example.com' }, 0)
    expect(quoted).toContain('> line one\n> line two')
    expect(quoted).toContain('"Ada" <ada@example.com> wrote:')
  })
})
