import type { CalEvent } from '@shared/calendar'

/** Calendar for the demo inbox: a believable day relative to whatever day is shown. */
export function demoEvents(dayStart: number): CalEvent[] {
  const h = (hours: number) => dayStart + hours * 3_600_000
  const weekday = new Date(dayStart).getDay()
  if (weekday === 0 || weekday === 6) return [{ id: 'd-run', title: 'Long run', start: h(8), end: h(9.5), allDay: false }]
  return [
    { id: 'd-standup', title: 'Standup', start: h(9.5), end: h(9.75), allDay: false, meetLink: 'https://meet.google.com/demo' },
    { id: 'd-1on1', title: '1:1 with Ada', start: h(11), end: h(11.5), allDay: false, location: 'Room 3' },
    { id: 'd-review', title: 'Design review', start: h(11.25), end: h(12.25), allDay: false },
    { id: 'd-lunch', title: 'Lunch with Grace', start: h(12.5), end: h(13.5), allDay: false, location: 'Tartine' },
    { id: 'd-focus', title: 'Focus: ship send later', start: h(14), end: h(16), allDay: false },
  ]
}
