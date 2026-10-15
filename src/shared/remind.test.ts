import { describe, expect, it } from 'vitest'
import { parseClock, parseRemind, remindPresets } from './remind'

// Wednesday 14 Oct 2026, 17:36 local
const now = new Date(2026, 9, 14, 17, 36)
const fmt = (date: Date | null) => (date ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}` : null)

describe('remindPresets', () => {
  it('matches Superhuman defaults at 8:00 AM', () => {
    const presets = remindPresets(now)
    expect(presets.map((preset) => [preset.label, fmt(preset.at)])).toEqual([
      ['tomorrow', '2026-10-15 8:00'],
      ['next week', '2026-10-19 8:00'],
      ['this weekend', '2026-10-17 8:00'],
      ['someday', null],
    ])
  })
})

describe('parseRemind', () => {
  it.each([
    ['2d', '2026-10-16 8:00'],
    ['3h', '2026-10-14 20:36'],
    ['30m', '2026-10-14 18:06'],
    ['1w', '2026-10-21 8:00'],
    ['in 2 weeks', '2026-10-28 8:00'],
    ['monday', '2026-10-19 8:00'],
    ['mon', '2026-10-19 8:00'],
    ['friday 3pm', '2026-10-16 15:00'],
    ['tomorrow 9:30am', '2026-10-15 9:30'],
    ['tomorrow at 3', '2026-10-15 15:00'],
    ['next week', '2026-10-19 8:00'],
    ['this weekend', '2026-10-17 8:00'],
    ['oct 20', '2026-10-20 8:00'],
    ['20 oct 2pm', '2026-10-20 14:00'],
    ['jan 3', '2027-1-3 8:00'],
    ['10/30', '2026-10-30 8:00'],
    ['2026-12-01', '2026-12-1 8:00'],
    ['9pm', '2026-10-14 21:00'],
    ['8am', '2026-10-15 8:00'],
    ['wednesday', '2026-10-21 8:00'],
  ])('%s', (text, expected) => {
    expect(fmt(parseRemind(text, now))).toBe(expected)
  })

  it('counts weekdays only when asked (2d on Friday returns Tuesday)', () => {
    const friday = new Date(2026, 9, 16, 10, 0)
    expect(fmt(parseRemind('2d', friday, { weekdaysOnly: true }))).toBe('2026-10-20 8:00')
    expect(fmt(parseRemind('2d', friday))).toBe('2026-10-18 8:00')
  })

  it('rejects nonsense', () => {
    expect(parseRemind('banana', now)).toBeNull()
    expect(parseRemind('', now)).toBeNull()
    expect(parseRemind('25:00', now)).toBeNull()
  })
})

describe('parseClock', () => {
  it('parses common forms', () => {
    expect(parseClock('3pm')).toEqual([15, 0])
    expect(parseClock('12am')).toEqual([0, 0])
    expect(parseClock('12pm')).toEqual([12, 0])
    expect(parseClock('15:30')).toEqual([15, 30])
    expect(parseClock('noon')).toEqual([12, 0])
    expect(parseClock('13pm')).toBeNull()
  })
})
