import { parseRemind, type RemindOptions } from './remind'
import type { OutgoingMail } from './types'

/** Send later and undo send. */
export interface ScheduledSend {
  id: string
  mail: OutgoingMail
  sendAt: number
  createdAt: number
  /** Optional reminder to put the thread back if nobody replies. */
  remindIfNoReplyAt?: number
}

export const UNDO_SEND_SECONDS = [0, 5, 10, 20, 30] as const

export function sendLaterPresets(now: Date): { label: string; at: Date }[] {
  const tomorrowMorning = parseRemind('tomorrow 8am', now) as Date
  const tomorrowAfternoon = parseRemind('tomorrow 1pm', now) as Date
  const monday = parseRemind('monday 8am', now) as Date
  const presets = [
    { label: 'Tomorrow morning', at: tomorrowMorning },
    { label: 'Tomorrow afternoon', at: tomorrowAfternoon },
    { label: 'Monday morning', at: monday },
  ]
  const inAnHour = new Date(now.getTime() + 3_600_000)
  if (inAnHour.getHours() >= 7 && inAnHour.getHours() < 20) presets.unshift({ label: 'In 1 hour', at: inAnHour })
  return presets
}

export function parseSendLater(text: string, now: Date, options?: RemindOptions): Date | null {
  return parseRemind(text, now, options)
}

/** Split a queue into due and pending items. */
export function dueSends(queue: ScheduledSend[], now: number): { due: ScheduledSend[]; pending: ScheduledSend[] } {
  const due: ScheduledSend[] = []
  const pending: ScheduledSend[] = []
  for (const item of queue) (item.sendAt <= now ? due : pending).push(item)
  return { due: due.sort((a, b) => a.sendAt - b.sendAt), pending }
}

/**
 * "Remind me if no reply": a returned reminder is suppressed when someone other
 * than me wrote in the thread after the reminder was set.
 */
export function shouldRemind(setAt: number, messages: { from: { email: string }; date: number }[], me: string): boolean {
  const mine = me.toLowerCase()
  return !messages.some((message) => message.date > setAt && message.from.email.toLowerCase() !== mine)
}
