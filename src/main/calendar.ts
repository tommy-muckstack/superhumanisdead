import { fromGoogle, toGoogleEvent, type CalEvent, type GoogleEvent, type NewEvent } from '@shared/calendar'
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

export async function createEvent(auth: GoogleAuth, event: NewEvent): Promise<CalEvent> {
  const url = new URL(BASE)
  url.searchParams.set('conferenceDataVersion', event.meet ? '1' : '0')
  // "none": the user's guests are only notified when they explicitly add attendees and confirm in the UI.
  url.searchParams.set('sendUpdates', event.attendees.length ? 'all' : 'none')
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await auth.accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toGoogleEvent(event)),
  })
  const json = (await response.json()) as GoogleEvent & { error?: { message?: string } }
  if (!response.ok) {
    if (response.status === 403) throw new Error('Calendar: sign out and back in to allow creating events.')
    throw new Error(`Calendar: ${json.error?.message ?? response.status}`)
  }
  return fromGoogle(json)
}
