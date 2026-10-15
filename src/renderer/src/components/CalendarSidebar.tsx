import { useEffect, useMemo, useRef, useState } from 'react'
import { freeSlots, formatSlots, layoutDay, type CalEvent } from '@shared/calendar'
import { demoEvents } from '../lib/demo-calendar'

interface Props {
  day: number
  demo: boolean
  version?: number
  onClose: () => void
  onShareAvailability: (text: string) => void
}

const HOUR_PX = 44
const DAY_MS = 86_400_000

export function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Day view beside the mail (Superhuman's "0"). Read-only Google Calendar, or demo data. */
export function CalendarSidebar({ day, demo, version, onClose, onShareAvailability }: Props) {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hour = startOfDay(Date.now()) === day ? Math.max(new Date().getHours() - 1, 0) : 8
    scrollRef.current?.scrollTo({ top: hour * HOUR_PX })
  }, [day])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    setError('')
    if (demo) {
      setEvents(demoEvents(day))
      return
    }
    window.duper.calendar
      .events(day, day + DAY_MS)
      .then((list) => !cancelled && setEvents(list))
      .catch((reason: unknown) => {
        if (cancelled) return
        setEvents([])
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [day, demo, version])

  const placed = useMemo(() => layoutDay(events, day), [events, day])
  const allDay = events.filter((event) => event.allDay)
  const isToday = startOfDay(now) === day
  const label = new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <aside className="side calendar">
      <div className="side-head">
        <span>{isToday ? 'Today' : label}</span>
        <span className="sub">{isToday ? label : ''}</span>
        <button className="close" onClick={onClose}>×</button>
      </div>
      <div className="cal-actions">
        <button className="chip" onClick={() => onShareAvailability(formatSlots(freeSlots(events, day)))}>Share availability</button>
        <span className="hint">
          <kbd>-</kbd> <kbd>T</kbd> <kbd>=</kbd>
        </span>
      </div>
      {error && <div className="cal-error">{error}</div>}
      {allDay.length > 0 && (
        <div className="all-day">
          {allDay.map((event) => (
            <div key={event.id} className="event all">{event.title}</div>
          ))}
        </div>
      )}
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid" style={{ height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="hour" style={{ top: hour * HOUR_PX }}>
              <span>{hour === 0 ? '' : new Date(2026, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' })}</span>
            </div>
          ))}
          {isToday && <div className="now-line" style={{ top: ((now - day) / 3_600_000) * HOUR_PX }} />}
          {placed.map((entry) => (
            <div
              key={entry.event.id}
              className={`event${entry.event.end < now ? ' past' : ''}`}
              style={{
                top: (entry.top / 60) * HOUR_PX,
                height: Math.max((entry.height / 60) * HOUR_PX - 2, 16),
                left: `calc(44px + (100% - 50px) * ${entry.column / entry.columns})`,
                width: `calc((100% - 50px) / ${entry.columns} - 2px)`,
              }}
              title={entry.event.location ?? ''}
            >
              <b>{entry.event.title}</b>
              <span>
                {new Date(entry.event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {entry.event.location ? ` · ${entry.event.location}` : ''}
              </span>
              {entry.event.meetLink && (
                <button className="join" onClick={() => void window.duper.shell.openExternal(entry.event.meetLink ?? '')}>Join</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
