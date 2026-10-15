/** Calendar sidebar helpers: event model, Google Calendar parsing, day layout. */
export interface CalEvent {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  location?: string
  meetLink?: string
  attendees?: { email: string; name?: string; response?: string }[]
  calendarColor?: string
}

export interface GoogleEvent {
  id: string
  summary?: string
  location?: string
  hangoutLink?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  attendees?: { email: string; displayName?: string; responseStatus?: string }[]
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] }
}

function parseDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime()
}

export function fromGoogle(event: GoogleEvent): CalEvent {
  const allDay = Boolean(event.start.date && !event.start.dateTime)
  const start = allDay ? parseDay(event.start.date as string) : Date.parse(event.start.dateTime as string)
  const end = allDay ? parseDay(event.end.date as string) : Date.parse(event.end.dateTime as string)
  const video = event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ?? event.hangoutLink
  return {
    id: event.id,
    title: event.summary || '(No title)',
    start,
    end,
    allDay,
    location: event.location,
    meetLink: video,
    attendees: event.attendees?.map((a) => ({ email: a.email, name: a.displayName, response: a.responseStatus })),
  }
}

export interface Placed {
  event: CalEvent
  column: number
  columns: number
  top: number
  height: number
}

/**
 * Lay out timed events for one day: overlapping events share the width in columns.
 * `top` and `height` are minutes from the start of the day.
 */
export function layoutDay(events: CalEvent[], dayStart: number): Placed[] {
  const timed = events.filter((event) => !event.allDay).sort((a, b) => a.start - b.start || b.end - a.end)
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    const columns = Math.max(1, ...cluster.map((p) => p.column + 1))
    cluster.forEach((p) => (p.columns = columns))
    cluster = []
  }
  for (const event of timed) {
    if (event.start >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    const used = new Set(cluster.filter((p) => p.event.end > event.start).map((p) => p.column))
    let column = 0
    while (used.has(column)) column++
    const top = Math.max(0, (event.start - dayStart) / 60_000)
    const height = Math.max(15, (Math.min(event.end, dayStart + 86_400_000) - Math.max(event.start, dayStart)) / 60_000)
    const entry = { event, column, columns: 1, top, height }
    cluster.push(entry)
    placed.push(entry)
    clusterEnd = Math.max(clusterEnd, event.end)
  }
  flush()
  return placed
}

/** Free slots between events in working hours, for "Share Availability". */
export function freeSlots(events: CalEvent[], dayStart: number, options: { from?: number; to?: number; minMinutes?: number } = {}): { start: number; end: number }[] {
  const from = dayStart + (options.from ?? 9) * 3_600_000
  const to = dayStart + (options.to ?? 17) * 3_600_000
  const min = (options.minMinutes ?? 30) * 60_000
  const busy = events.filter((e) => !e.allDay && e.end > from && e.start < to).sort((a, b) => a.start - b.start)
  const slots: { start: number; end: number }[] = []
  let cursor = from
  for (const event of busy) {
    if (event.start - cursor >= min) slots.push({ start: cursor, end: event.start })
    cursor = Math.max(cursor, event.end)
  }
  if (to - cursor >= min) slots.push({ start: cursor, end: to })
  return slots
}

export function formatSlots(slots: { start: number; end: number }[], locale = 'en-US'): string {
  const time = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return slots.map((slot) => `• ${new Date(slot.start).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time(slot.start)} – ${time(slot.end)}`).join('\n')
}

export const DAY_MS = 86_400_000

/** Monday 00:00 of the week containing `ms` (local time). */
export function weekStart(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return date.getTime()
}

/** Seven day columns, each laid out like the day view. Uses calendar dates so DST days still line up. */
export function layoutWeek(events: CalEvent[], start: number): { day: number; placed: Placed[]; allDay: CalEvent[] }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    const day = date.getTime()
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    const end = next.getTime()
    const inDay = events.filter((event) => event.start < end && event.end > day)
    return { day, placed: layoutDay(inDay.filter((event) => !event.allDay), day), allDay: inDay.filter((event) => event.allDay) }
  })
}

export interface NewEvent {
  title: string
  start: number
  end: number
  allDay: boolean
  attendees: string[]
  location?: string
  meet: boolean
}

/** Build the Google Calendar insert body (with an optional Meet link). */
export function toGoogleEvent(event: NewEvent, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): Record<string, unknown> {
  const iso = (ms: number) => new Date(ms).toISOString()
  const day = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return {
    summary: event.title || '(No title)',
    location: event.location,
    start: event.allDay ? { date: day(event.start) } : { dateTime: iso(event.start), timeZone },
    end: event.allDay ? { date: day(event.end) } : { dateTime: iso(event.end), timeZone },
    attendees: event.attendees.length ? event.attendees.map((email) => ({ email })) : undefined,
    conferenceData: event.meet ? { createRequest: { requestId: `sid-${event.start}-${event.title.length}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } : undefined,
  }
}

/**
 * Split "Lunch with Ada tomorrow 1pm for 45m" into a title, a when-phrase and a duration.
 * The when-phrase is parsed by the caller with parseRemind so all date grammar lives in one place.
 */
export function splitQuickEvent(input: string): { title: string; when: string; minutes: number } {
  let text = input.trim()
  let minutes = 30
  const duration = /\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b\s*$/i.exec(text)
  if (duration) {
    const value = Number(duration[1])
    minutes = /^h/i.test(duration[2] ?? '') ? Math.round(value * 60) : Math.round(value)
    text = text.slice(0, duration.index).trim()
  }
  const when = /\s+((?:today|tomorrow|tonight|next\s+\w+|this\s+\w+|on\s+\w+|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|at\s|\d{1,2}(?::\d{2})?\s*(?:am|pm))[\s\S]*)$/i.exec(text)
  if (!when) return { title: text, when: '', minutes }
  return { title: text.slice(0, when.index).trim(), when: (when[1] ?? '').replace(/^on\s+/i, '').trim(), minutes }
}
