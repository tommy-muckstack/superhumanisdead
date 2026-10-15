import { fromGoogle, type CalEvent, type GoogleEvent } from '@shared/calendar'
import type { GoogleAuth } from './google-auth'

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export async function listEvents(auth: GoogleAuth, from: number, to: number): Promise<CalEvent[]> {
  const url = new URL(BASE)
  url.searchParams.set('timeMin', new Date(from).toISOString())
  url.searchParams.set('timeMax', new Date(to).toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await auth.accessToken()}` } })
  const json = (await response.json()) as { items?: GoogleEvent[]; error?: { message?: string; status?: string } }
  if (!response.ok) {
    if (response.status === 403) throw new Error('Calendar: sign out and back in to allow calendar access.')
    throw new Error(`Calendar: ${json.error?.message ?? response.status}`)
  }
  return (json.items ?? []).map(fromGoogle)
}
