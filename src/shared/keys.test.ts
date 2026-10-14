import { describe, expect, it } from 'vitest'
import { KeySequencer, SNOOZE_PRESETS, chordOf } from './keys'

const press = (key: string, mods: Partial<{ metaKey: boolean; shiftKey: boolean; altKey: boolean; ctrlKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('key sequencer', () => {
  it('maps single keys', () => {
    const sequencer = new KeySequencer()
    expect(sequencer.feed(press('j'))).toBe('next')
    expect(sequencer.feed(press('e'))).toBe('done')
  })
  it('maps two-key sequences', () => {
    const sequencer = new KeySequencer()
    expect(sequencer.feed(press('g'))).toBeNull()
    expect(sequencer.feed(press('i'))).toBe('goImportant')
  })
  it('maps modifier chords', () => {
    expect(chordOf(press('k', { metaKey: true }))).toBe('meta+k')
    expect(chordOf(press('?', { shiftKey: true }))).toBe('shift+/')
    expect(chordOf(press('Tab', { shiftKey: true }))).toBe('shift+Tab')
    expect(new KeySequencer().feed(press('R', { metaKey: true, shiftKey: true }))).toBe('draftReply')
  })
})

describe('snooze presets', () => {
  it('tomorrow morning is 8am next day', () => {
    const now = new Date(2026, 9, 14, 15, 0)
    const until = SNOOZE_PRESETS.find((preset) => preset.id === 'tomorrow')?.until(now)
    expect(until?.getDate()).toBe(15)
    expect(until?.getHours()).toBe(8)
  })
  it('next week lands on a Monday', () => {
    const now = new Date(2026, 9, 14, 15, 0)
    const until = SNOOZE_PRESETS.find((preset) => preset.id === 'nextweek')?.until(now)
    expect(until?.getDay()).toBe(1)
    expect(until && until > now).toBe(true)
  })
})
