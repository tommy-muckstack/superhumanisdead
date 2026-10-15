import { describe, expect, it } from 'vitest'
import { continueList, insertLink, markupToText, renderMarkup, toggleLinePrefix, wrapSelection } from './format'
import { emojiMatches, emojiTrigger } from './emoji'
import { instantIntro } from './intro'
import { parseUnsubscribe } from './unsubscribe'
import { moveChange, removeAllLabels, removeCurrentLabel, toggleLabelChange, userLabels } from './labels'
import { layoutWeek, splitQuickEvent, toGoogleEvent, weekStart } from './calendar'
import { buildRawMessage } from './mime'
import { draftToMail } from './compose'
import { KeySequencer, composeCommand } from './keys'
import type { Label } from './types'

const press = (key: string, mods: Partial<{ metaKey: boolean; shiftKey: boolean; altKey: boolean; ctrlKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('format', () => {
  it('wraps and unwraps selections', () => {
    const a = wrapSelection('hi there', 3, 8, '**')
    expect(a).toEqual({ text: 'hi **there**', start: 5, end: 10 })
    expect(wrapSelection(a.text, a.start, a.end, '**').text).toBe('hi there')
    expect(insertLink('see docs', 4, 8, 'https://x.io').text).toBe('see [docs](https://x.io)')
  })
  it('toggles list prefixes and continues lists', () => {
    expect(toggleLinePrefix('a\nb', 0, 3, 'bullet').text).toBe('- a\n- b')
    expect(toggleLinePrefix('- a\n- b', 0, 7, 'bullet').text).toBe('a\nb')
    expect(toggleLinePrefix('a\nb', 0, 3, 'number').text).toBe('1. a\n2. b')
    expect(continueList('1. one', 6)?.text).toBe('1. one\n2. ')
    expect(continueList('- ', 2)?.text).toBe('')
    expect(continueList('plain', 5)).toBeNull()
  })
  it('renders markup to safe html', () => {
    const html = renderMarkup('**Hi** _there_ ++u++ ~~s~~ [x](https://a.b)\n- one\n- two\n> quoted <script>')
    expect(html).toContain('<b>Hi</b>')
    expect(html).toContain('<i>there</i>')
    expect(html).toContain('<u>u</u>')
    expect(html).toContain('<s>s</s>')
    expect(html).toContain('<a href="https://a.b">x</a>')
    expect(html).toContain('<ul')
    expect(html).toContain('<blockquote')
    expect(html).not.toContain('<script>')
    expect(markupToText('**a** [b](https://c)')).toBe('a b <https://c>')
  })
  it('does not italicize snake_case words', () => {
    expect(renderMarkup('file_name_here')).not.toContain('<i>')
  })
})

describe('emoji', () => {
  it('detects triggers and matches codes', () => {
    expect(emojiTrigger('nice :thu', 9)).toEqual({ query: 'thu', start: 5 })
    expect(emojiTrigger('time 10:30', 10)).toBeNull()
    expect(emojiMatches('thumbs')[0]?.char).toBe('👍')
  })
})

describe('instant intro', () => {
  it('moves the introducer to bcc', () => {
    const out = instantIntro({ to: 'Bob <bob@x>', cc: 'carol@x', bcc: '', body: '' }, { name: 'Bob Smith', email: 'bob@x' })
    expect(out.to).toBe('carol@x')
    expect(out.bcc).toBe('bob@x')
    expect(out.body).toContain('Thanks Bob! Moving you to Bcc')
  })
})

describe('unsubscribe', () => {
  it('parses url, mailto and one-click', () => {
    const u = parseUnsubscribe('<mailto:u@list.io?subject=stop>, <https://list.io/u?id=1>', 'List-Unsubscribe=One-Click')
    expect(u).toEqual({ url: 'https://list.io/u?id=1', mailto: { to: 'u@list.io', subject: 'stop', body: 'unsubscribe' }, oneClick: true })
    expect(parseUnsubscribe('<http://insecure>')).toBeNull()
    expect(parseUnsubscribe(null)).toBeNull()
  })
})

describe('labels', () => {
  const labels: Label[] = [
    { id: 'INBOX', name: 'INBOX', type: 'system' },
    { id: 'L2', name: 'Zeta', type: 'user' },
    { id: 'L1', name: 'Alpha', type: 'user' },
  ]
  it('sorts user labels and computes changes', () => {
    expect(userLabels(labels).map((l) => l.name)).toEqual(['Alpha', 'Zeta'])
    expect(toggleLabelChange([['L1'], []], 'L1')).toEqual({ add: ['L1'], remove: [] })
    expect(toggleLabelChange([['L1'], ['L1']], 'L1')).toEqual({ add: [], remove: ['L1'] })
    expect(moveChange('L1')).toEqual({ add: ['L1'], remove: ['INBOX'] })
    expect(removeCurrentLabel(null)).toEqual({ add: [], remove: ['INBOX'] })
    expect(removeAllLabels(['INBOX', 'L1', 'L2'], labels)).toEqual({ add: [], remove: ['L1', 'L2'] })
  })
})

describe('calendar week and events', () => {
  it('starts weeks on monday and lays out 7 days', () => {
    const wed = new Date(2026, 9, 14, 15).getTime()
    const start = weekStart(wed)
    expect(new Date(start).getDay()).toBe(1)
    const ev = { id: 'a', title: 'a', start: wed, end: wed + 3_600_000, allDay: false }
    const week = layoutWeek([ev], start)
    expect(week).toHaveLength(7)
    expect(week[2]?.placed).toHaveLength(1)
    expect(week[0]?.placed).toHaveLength(0)
  })
  it('splits quick event text', () => {
    expect(splitQuickEvent('Lunch with Ada tomorrow 1pm for 45m')).toEqual({ title: 'Lunch with Ada', when: 'tomorrow 1pm', minutes: 45 })
    expect(splitQuickEvent('Board prep friday 9am 2h')).toEqual({ title: 'Board prep', when: 'friday 9am', minutes: 120 })
    expect(splitQuickEvent('Think')).toEqual({ title: 'Think', when: '', minutes: 30 })
  })
  it('builds google insert bodies', () => {
    const body = toGoogleEvent({ title: 'x', start: 0, end: 1_800_000, allDay: false, attendees: ['a@x'], meet: true }, 'UTC')
    expect(body['attendees']).toEqual([{ email: 'a@x' }])
    expect((body['start'] as { timeZone: string }).timeZone).toBe('UTC')
    expect(body['conferenceData']).toBeTruthy()
  })
})

describe('mime with attachments and alias', () => {
  it('builds multipart/mixed', () => {
    const mail = draftToMail({ to: 'a@x', cc: '', bcc: '', subject: 's', body: '**hi**', quoted: '', from: 'Alias <alias@x>', attachments: [{ filename: 'a.txt', mimeType: 'text/plain', data: Buffer.from('hello').toString('base64'), size: 5 }] })
    const raw = buildRawMessage(mail, 'me@x')
    expect(raw).toContain('From: Alias <alias@x>')
    expect(raw).toContain('multipart/mixed')
    expect(raw).toContain('filename="a.txt"')
    expect(raw).toContain(Buffer.from('hello').toString('base64'))
    expect(mail.html).toContain('<b>hi</b>')
    expect(mail.text).toBe('hi')
  })
})

describe('new key bindings', () => {
  it('maps reading, organizing and account keys', () => {
    const s = new KeySequencer()
    expect(s.feed(press('n'))).toBe('nextMessage')
    expect(s.feed(press('ArrowLeft'))).toBe('folderMenu')
    expect(s.feed(press(' '))).toBe('pageDown')
    expect(s.feed(press(' ', { shiftKey: true }))).toBe('pageUp')
    expect(s.feed(press('3', { ctrlKey: true }))).toBe('account3')
    expect(s.feed(press('k', { ctrlKey: true }))).toBe('palette')
    expect(s.feed(press('Y', { shiftKey: true }))).toBe('removeAllLabels')
    expect(s.feed(press('['))).toBe('removeLabelNext')
    expect(s.feed(press('u', { metaKey: true }))).toBe('unsubscribe')
    expect(s.feed(press('Enter', { shiftKey: true }))).toBe('replyAllPop')
  })
  it('maps formatting keys in the composer', () => {
    expect(composeCommand(press('b', { metaKey: true }))).toBe('bold')
    expect(composeCommand(press('u', { metaKey: true }))).toBe('underline')
    expect(composeCommand(press('*', { metaKey: true, shiftKey: true }))).toBe('bullets')
    expect(composeCommand(press('&', { metaKey: true, shiftKey: true }))).toBe('numbered')
    expect(composeCommand(press('I', { metaKey: true, shiftKey: true }))).toBe('instantIntro')
  })
})
