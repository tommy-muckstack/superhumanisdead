import type { Address } from '@shared/types'

export function whenShort(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (date.getFullYear() === today.getFullYear()) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export function whenLong(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function whenSnooze(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return time
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`
}

export function firstName(address: Address): string {
  const name = address.name === address.email ? address.email.split('@')[0] ?? address.email : address.name
  return name.split(/\s+/)[0] ?? name
}

export function participantsLabel(participants: Address[], me: string): string {
  const names = participants.map((address) => (address.email === me ? 'Me' : firstName(address)))
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

export function initials(address: Address): string {
  const source = address.name === address.email ? address.email : address.name
  const parts = source.replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const letters = parts.length >= 2 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : (parts[0] ?? source).slice(0, 2)
  return letters.toUpperCase()
}

const AVATAR_COLORS = ['#5b6cff', '#8a5bff', '#d85b9a', '#e08a3c', '#3fa37a', '#2f9bd6', '#c65b5b', '#6b8cff']

export function avatarColor(email: string): string {
  let hash = 0
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? '#5b6cff'
}

export function cleanReplySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`
}

export function forwardSubject(subject: string): string {
  return /^fwd?:/i.test(subject) ? subject : `Fwd: ${subject}`
}
