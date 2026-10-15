import { describe, expect, it } from 'vitest'
import { BINDINGS, KeySequencer, SNOOZE_PRESETS, chordOf, composeCommand, keycaps } from './keys'

const press = (key: string, mods: Partial<{ metaKey: boolean; shiftKey: boolean; altKey: boolean; ctrlKey: boolean }> = {}) => ({
  key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods,
})

describe('key sequencer', () => {
  it('maps single keys', () => {
    const s = new KeySequencer()
    expect(s.feed(press('j'))).toBe('next')
    expect(s.feed(press('e'))).toBe('done')
    expect(s.feed(press('Enter'))).toBe('replyAll')
  })
  it('distinguishes shifted letters and punctuation', () => {
    const s = new KeySequencer()
    expect(s.feed(press('E', { shiftKey: true }))).toBe('notDone')
    expect(s.feed(press('#', { shiftKey: true }))).toBe('trash')
    expect(s.feed(press('!', { shiftKey: true }))).toBe('spam')
    expect(s.feed(press('?', { shiftKey: true }))).toBe('askAi')
    expect(s.feed(press('J', { shiftKey: true }))).toBe('extendNext')
  })
  it('maps two-key sequences including punctuation', () => {
    const s = new KeySequencer()
    expect(s.feed(press('g'))).toBeNull()
    expect(s.feed(press('i'))).toBe('goImportant')
    s.feed(press('g'))
    expect(s.feed(press('#', { shiftKey: true }))).toBe('goTrash')
    s.feed(press('g'))
    expect(s.feed(press(';'))).toBe('goSnippets')
  })
  it('maps modifier chords', () => {
    expect(chordOf(press('k', { metaKey: true }))).toBe('meta+k')
    expect(chordOf(press('Tab', { shiftKey: true }))).toBe('shift+Tab')
    expect(new KeySequencer().feed(press('R', { metaKey: true, shiftKey: true }))).toBe('draftReply')
  })
  it('ignores compose-only bindings globally and maps them in the composer', () => {
    expect(new KeySequencer().feed(press('L', { metaKey: true, shiftKey: true }))).toBeNull()
    expect(composeCommand(press('L', { metaKey: true, shiftKey: true }))).toBe('sendLater')
    expect(composeCommand(press(';', { metaKey: true }))).toBe('useSnippet')
    expect(composeCommand(press('<', { metaKey: true, shiftKey: true }))).toBe('discard')
    expect(composeCommand(press('Enter', { metaKey: true, shiftKey: true }))).toBe('sendDone')
  })
  it('has no duplicate global chords', () => {
    const keys = BINDINGS.filter((b) => b.scope === 'global' && b.keys).map((b) => b.keys)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('renders keycaps', () => {
    expect(keycaps('meta+shift+l')).toEqual(['⌘⇧L'])
    expect(keycaps('g i')).toEqual(['G', 'I'])
    expect(keycaps('')).toEqual([])
  })
})

describe('snooze presets', () => {
  it('tomorrow morning is 8am next day', () => {
    const now = new Date(2026, 9, 14, 15, 0)
    const until = SNOOZE_PRESETS.find((preset) => preset.id === 'tomorrow')?.until(now)
    expect(until?.getDate()).toBe(15)
    expect(until?.getHours()).toBe(8)
  })
})
