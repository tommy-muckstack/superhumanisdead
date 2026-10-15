import { useEffect, useMemo, useRef, useState } from 'react'
import { DAY_MS, layoutWeek, splitQuickEvent, weekStart, type CalEvent, type NewEvent } from '@shared/calendar'
import { parseRemind } from '@shared/remind'
import { demoEvents } from '../lib/demo-calendar'
import { Keys } from './Overlays'

const HOUR_PX = 40

export function useEvents(from: number, to: number, demo: boolean, version: number): { events: CalEvent[]; error: string } {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setError('')
    if (demo) {
      const days = Math.max(1, Math.round((to - from) / DAY_MS))
      setEvents(Array.from({ length: days }, (_, index) => demoEvents(new Date(new Date(from).setDate(new Date(from).getDate() + index)).getTime())).flat())
      return
    }
    window.duper.calendar
      .events(from, to)
      .then((list) => !cancelled && setEvents(list))
      .catch((reason: unknown) => {
        if (cancelled) return
        setEvents([])
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [from, to, demo, version])
  return { events, error }
}

/** Full-width week view (Superhuman's "2"). */
export function CalendarWeek({ anchor, demo, version, onNavigate, onCreate, onClose }: { anchor: number; demo: boolean; version: number; onNavigate: (ms: number) => void; onCreate: () => void; onClose: () => void }) {
  const start = weekStart(anchor)
  const end = start + 7 * DAY_MS + 3_600_000
  const { events, error } = useEvents(start, end, demo, version)
  const week = useMemo(() => layoutWeek(events, start), [events, start])
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = Date.now()
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * HOUR_PX })
  }, [])
  const label = `${new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(start + 6 * DAY_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="week"
        tabIndex={0}
        ref={(node) => node?.focus()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
          else if (event.key === '-' || event.key === 'p') onNavigate(anchor - 7 * DAY_MS)
          else if (event.key === '=' || event.key === 'n') onNavigate(anchor + 7 * DAY_MS)
          else if (event.key === 't') onNavigate(Date.now())
          else if (event.key === 'b') {
            event.preventDefault()
            onCreate()
          }
        }}
      >
        <div className="side-head">
          <span>{label}</span>
          <span className="hint"><Keys keys="-" /> <Keys keys="t" /> <Keys keys="=" /> · <Keys keys="b" /> new event</span>
          <button className="close" onClick={onClose}>×</button>
        </div>
        {error && <div className="cal-error">{error}</div>}
        <div className="week-head">
          <span />
          {week.map((column) => (
            <div key={column.day} className={`wd${new Date(column.day).toDateString() === new Date(now).toDateString() ? ' today' : ''}`}>
              {new Date(column.day).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
              {column.allDay.map((event) => (
                <div key={event.id} className="event all">{event.title}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="week-scroll" ref={scrollRef}>
          <div className="week-grid" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="hour" style={{ top: hour * HOUR_PX }}>
                <span>{hour === 0 ? '' : new Date(2026, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' })}</span>
              </div>
            ))}
            {week.map((column, index) => (
              <div key={column.day} className="week-col" style={{ left: `calc(46px + (100% - 46px) * ${index} / 7)`, width: 'calc((100% - 46px) / 7)' }}>
                {column.placed.map((entry) => (
                  <div
                    key={entry.event.id}
                    className={`event${entry.event.end < now ? ' past' : ''}`}
                    style={{ top: (entry.top / 60) * HOUR_PX, height: Math.max((entry.height / 60) * HOUR_PX - 2, 14), left: `${(entry.column / entry.columns) * 100}%`, width: `calc(${100 / entry.columns}% - 2px)` }}
                    title={`${entry.event.title}${entry.event.location ? ` · ${entry.event.location}` : ''}`}
                  >
                    <b>{entry.event.title}</b>
                    <span>{new Date(entry.event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function nextHalfHour(): number {
  const date = new Date()
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60)
  return date.getTime()
}

function toLocalInput(ms: number): string {
  const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}

/**
 * B: quick create ("Lunch with Ada tomorrow 1pm for 45m"); ⇧B: empty form.
 * Guests are only emailed when you add attendees and confirm, and the form says so.
 */
export function EventForm({ empty, defaultAttendees = '', onCreate, onClose }: { empty: boolean; defaultAttendees?: string; onCreate: (event: NewEvent) => Promise<void>; onClose: () => void }) {
  const [quick, setQuick] = useState('')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(() => nextHalfHour())
  const [minutes, setMinutes] = useState(30)
  const [attendees, setAttendees] = useState(defaultAttendees)
  const [meet, setMeet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(empty)

  const parsed = useMemo(() => {
    if (!quick.trim()) return null
    const split = splitQuickEvent(quick)
    const when = split.when ? parseRemind(split.when, new Date(), { defaultHour: 9 }) : null
    return { ...split, at: when }
  }, [quick])

  const guests = attendees.split(/[,;\s]+/).filter((entry) => entry.includes('@'))

  const submit = async () => {
    const event: NewEvent = showForm || !parsed
      ? { title: title.trim(), start, end: start + minutes * 60_000, allDay: false, attendees: guests, meet }
      : { title: parsed.title, start: (parsed.at ?? new Date(nextHalfHour())).getTime(), end: (parsed.at ?? new Date(nextHalfHour())).getTime() + parsed.minutes * 60_000, allDay: false, attendees: guests, meet }
    if (!event.title) return setError('Give the event a title.')
    setBusy(true)
    setError('')
    try {
      await onCreate(event)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="picker event-form"
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter' && !event.shiftKey && (event.target as HTMLElement).tagName !== 'BUTTON') {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <div className="picker-title">New event</div>
        {!showForm ? (
          <>
            <input autoFocus value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="Lunch with Ada tomorrow 1pm for 45m" />
            {parsed && (
              <div className="items">
                <div className="item active">
                  <span>{parsed.title || 'Untitled'}</span>
                  <span className="when">{parsed.at ? `${parsed.at.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${parsed.minutes}m` : 'Next half hour'}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="event-fields">
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
            <label>Starts <input type="datetime-local" value={toLocalInput(start)} onChange={(event) => event.target.value && setStart(new Date(event.target.value).getTime())} /></label>
            <label>Length <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
          </div>
        )}
        <div className="event-fields">
          <input value={attendees} onChange={(event) => setAttendees(event.target.value)} placeholder="Guests (emails, optional)" />
          <label className="inline"><input type="checkbox" checked={meet} onChange={(event) => setMeet(event.target.checked)} /> Add Google Meet</label>
          {guests.length > 0 && <div className="warn">Google will email an invitation to {guests.length === 1 ? guests[0] : `${guests.length} guests`} when you create this.</div>}
          {error && <div className="warn error">{error}</div>}
        </div>
        <div className="confirm-actions">
          {!showForm && <button className="btn ghost" onClick={() => setShowForm(true)}>More options</button>}
          <button className="btn ghost" onClick={onClose}>Cancel <Keys keys="Escape" /></button>
          <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create'} <Keys keys="Enter" /></button>
        </div>
      </div>
    </div>
  )
}
