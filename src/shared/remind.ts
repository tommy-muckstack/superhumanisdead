/**
 * Remind Me ("snooze") time parsing, modelled on Superhuman's Remind Me menu:
 * presets tomorrow / next week / this weekend / someday at 8:00 AM, plus free text
 * such as "monday", "2d", "3h", "in 2 weeks", "tomorrow 3pm", "oct 20 9am".
 */
export interface RemindOptions {
  /** Count "Nd" as working days (a 2d reminder set on Friday returns Tuesday). */
  weekdaysOnly?: boolean
  /** Hour used when the text names a day but no time. */
  defaultHour?: number
}

export interface RemindPreset {
  id: 'tomorrow' | 'nextweek' | 'weekend' | 'someday'
  label: string
  at: Date | null
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function at(date: Date, hour: number, minute = 0): Date {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

function addDays(date: Date, days: number, weekdaysOnly = false): Date {
  const next = new Date(date)
  if (!weekdaysOnly) {
    next.setDate(next.getDate() + days)
    return next
  }
  let left = days
  while (left > 0) {
    next.setDate(next.getDate() + 1)
    const day = next.getDay()
    if (day !== 0 && day !== 6) left--
  }
  return next
}

function nextWeekday(now: Date, weekday: number, strictlyAfter = true): Date {
  const next = new Date(now)
  let delta = (weekday - now.getDay() + 7) % 7
  if (delta === 0 && strictlyAfter) delta = 7
  next.setDate(next.getDate() + delta)
  return next
}

export function remindPresets(now: Date, options: RemindOptions = {}): RemindPreset[] {
  const hour = options.defaultHour ?? 8
  return [
    { id: 'tomorrow', label: 'tomorrow', at: at(addDays(now, 1), hour) },
    { id: 'nextweek', label: 'next week', at: at(nextWeekday(now, 1), hour) },
    { id: 'weekend', label: 'this weekend', at: at(nextWeekday(now, 6, now.getDay() === 6), hour) },
    { id: 'someday', label: 'someday', at: null },
  ]
}

/** Parse "3pm", "15:30", "9am", "noon". Returns [hour, minute] or null. */
export function parseClock(text: string): [number, number] | null {
  const value = text.trim().toLowerCase()
  if (value === 'noon') return [12, 0]
  if (value === 'midnight') return [0, 0]
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(value)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]
  if (minute > 59 || hour > 23) return null
  if (meridiem) {
    if (hour > 12 || hour === 0) return null
    if (meridiem.startsWith('p') && hour < 12) hour += 12
    if (meridiem.startsWith('a') && hour === 12) hour = 0
  } else if (!match[2] && hour < 7) {
    // "at 3" in an email client means the afternoon.
    hour += 12
  }
  return [hour, minute]
}

/**
 * Parse free text into a reminder time. Returns null when the text is not understood.
 * The result is always in the future relative to `now`.
 */
export function parseRemind(input: string, now: Date, options: RemindOptions = {}): Date | null {
  const hour = options.defaultHour ?? 8
  let text = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!text) return null
  text = text.replace(/^in /, '').replace(/^on /, '').replace(/^at /, '')

  // Relative durations: 2d, 3h, 30m, 1w, "2 days", "3 hours", "2 weeks", "1 month"
  const rel = /^(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?|mo|months?)$/.exec(text)
  if (rel) {
    const amount = Number(rel[1])
    const unit = rel[2] ?? ''
    if (unit.startsWith('mo')) {
      const next = new Date(now)
      next.setMonth(next.getMonth() + amount)
      return at(next, hour)
    }
    if (unit.startsWith('m')) return new Date(now.getTime() + amount * 60_000)
    if (unit.startsWith('h')) return new Date(now.getTime() + amount * 3_600_000)
    if (unit.startsWith('d')) return at(addDays(now, amount, options.weekdaysOnly), hour)
    if (unit.startsWith('w')) return at(addDays(now, amount * 7), hour)
  }

  // Split a trailing clock time: "tomorrow 3pm", "monday at 9:30"
  let clock: [number, number] | null = null
  const parts = text.split(' ')
  for (let take = 2; take >= 1; take--) {
    if (parts.length <= take) continue
    const rawTail = parts.slice(-take).join(' ')
    const tail = rawTail.replace(/^at /, '')
    const explicit = /(am|pm|a|p|:\d\d)$|^(noon|midnight)$/.test(tail) || parts[parts.length - take - 1] === 'at' || rawTail.startsWith('at ')
    const parsed = explicit ? parseClock(tail) : null
    if (parsed) {
      clock = parsed
      text = parts.slice(0, -take).join(' ').replace(/ at$/, '')
      break
    }
  }
  const finish = (day: Date): Date | null => {
    const result = clock ? at(day, clock[0], clock[1]) : at(day, hour)
    return result > now ? result : null
  }

  // A bare clock time: "3pm" means today, or tomorrow if already past.
  const onlyClock = parseClock(text)
  if (onlyClock && !clock) {
    const today = at(now, onlyClock[0], onlyClock[1])
    return today > now ? today : at(addDays(now, 1), onlyClock[0], onlyClock[1])
  }

  switch (text) {
    case 'today':
    case 'tonight':
    case 'this evening':
      return clock ? finish(now) : at(now, text === 'today' ? Math.max(now.getHours() + 3, 17) : 19) // later today
    case 'later':
    case 'later today':
      return new Date(now.getTime() + 3 * 3_600_000)
    case 'tomorrow':
    case 'tmrw':
    case 'tom':
      return finish(addDays(now, 1))
    case 'next week':
      return finish(nextWeekday(now, 1))
    case 'this weekend':
    case 'weekend':
      return finish(nextWeekday(now, 6, now.getDay() === 6))
    case 'next month': {
      const next = new Date(now)
      next.setMonth(next.getMonth() + 1, 1)
      return finish(next)
    }
  }

  const dayName = text.replace(/^next /, '')
  const dayIndex = DAYS.findIndex((day) => day === dayName || day.slice(0, 3) === dayName || (dayName.length >= 3 && day.startsWith(dayName)))
  if (dayIndex >= 0) {
    let day = nextWeekday(now, dayIndex, !clock)
    if (text.startsWith('next ') && (day.getTime() - now.getTime()) / 86_400_000 < 7 && day.getDay() !== now.getDay()) {
      // "next friday" said on a Monday still means this coming Friday in practice.
      day = nextWeekday(now, dayIndex)
    }
    const result = finish(day)
    return result ?? finish(addDays(day, 7))
  }

  // Dates: "oct 20", "20 oct", "10/20", "2026-10-20"
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text)
  const monthFirst = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?$/.exec(text)
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})$/.exec(text)
  let date: Date | null = null
  if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  else if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : now.getFullYear()
    date = new Date(year, Number(slash[1]) - 1, Number(slash[2]))
  } else if (monthFirst || dayFirst) {
    const monthName = (monthFirst ? monthFirst[1] : dayFirst?.[2]) ?? ''
    const dayOfMonth = Number(monthFirst ? monthFirst[2] : dayFirst?.[1])
    const month = MONTHS.indexOf(monthName.slice(0, 3))
    if (month >= 0) date = new Date(now.getFullYear(), month, dayOfMonth)
  }
  if (date && !Number.isNaN(date.getTime())) {
    const result = finish(date)
    if (result) return result
    if (!iso && !(slash && slash[3])) {
      const nextYear = new Date(date)
      nextYear.setFullYear(nextYear.getFullYear() + 1)
      return finish(nextYear)
    }
  }
  return null
}
