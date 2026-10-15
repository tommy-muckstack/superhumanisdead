import { describe, expect, it } from 'vitest'
import { applyHint, draftToMail, firstRecipient, insertAt, replaceTrigger, searchHints } from './compose'

describe('compose helpers', () => {
  it('builds outgoing mail with signature and quote', () => {
    const mail = draftToMail({ to: 'a@x, b@x', cc: '', bcc: '', subject: 'Hi', body: 'Hello', quoted: '\n\n> old', threadId: 't' }, '— T')
    expect(mail.to).toEqual(['a@x', 'b@x'])
    expect(mail.text).toBe('Hello\n\n— T\n\n> old')
    expect(mail.threadId).toBe('t')
  })
  it('replaces an inline trigger and inserts at caret', () => {
    expect(replaceTrigger('Hi ;cal there', 3, 7, 'CALL')).toEqual({ text: 'Hi CALL there', caret: 7 })
    expect(insertAt('ab', 1, 'X')).toEqual({ text: 'aXb', caret: 2 })
  })
  it('parses the first recipient', () => {
    expect(firstRecipient('"Ada L" <ada@x>, b@x')).toEqual({ name: 'Ada L', email: 'ada@x' })
    expect(firstRecipient('b@x')).toEqual({ name: '', email: 'b@x' })
  })
  it('suggests and applies search operators', () => {
    expect(searchHints('').length).toBeGreaterThan(5)
    expect(searchHints('invoice fr').map((h) => h.syntax)).toEqual(['from:'])
    expect(searchHints('from:ada')).toEqual([])
    expect(applyHint('invoice fr', 'from:')).toBe('invoice from:')
    expect(applyHint('-ha', 'has:attachment')).toBe('-has:attachment')
  })
})
