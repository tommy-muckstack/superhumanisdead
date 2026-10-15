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
