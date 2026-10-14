export type Command =
  | 'next'
  | 'prev'
  | 'open'
  | 'back'
  | 'done'
  | 'snooze'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'compose'
  | 'star'
  | 'unread'
  | 'select'
  | 'palette'
  | 'search'
  | 'nextSplit'
  | 'prevSplit'
  | 'goImportant'
  | 'goOther'
  | 'goStarred'
  | 'goSnoozed'
  | 'goSent'
  | 'goDrafts'
  | 'goDone'
  | 'summarize'
  | 'draftReply'
  | 'help'
  | 'undo'
  | 'refresh'

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export const BINDINGS: { keys: string; command: Command; label: string }[] = [
  { keys: 'j', command: 'next', label: 'Next conversation' },
  { keys: 'k', command: 'prev', label: 'Previous conversation' },
  { keys: 'Enter', command: 'open', label: 'Open conversation' },
  { keys: 'Escape', command: 'back', label: 'Back to list' },
  { keys: 'e', command: 'done', label: 'Mark done (archive)' },
  { keys: 'h', command: 'snooze', label: 'Snooze' },
  { keys: 'r', command: 'reply', label: 'Reply' },
  { keys: 'a', command: 'replyAll', label: 'Reply all' },
  { keys: 'f', command: 'forward', label: 'Forward' },
  { keys: 'c', command: 'compose', label: 'Compose' },
  { keys: 's', command: 'star', label: 'Star / unstar' },
  { keys: 'u', command: 'unread', label: 'Mark unread / read' },
  { keys: 'x', command: 'select', label: 'Select' },
  { keys: 'z', command: 'undo', label: 'Undo last action' },
  { keys: 'meta+k', command: 'palette', label: 'Command palette' },
  { keys: '/', command: 'search', label: 'Search' },
  { keys: 'Tab', command: 'nextSplit', label: 'Next split' },
  { keys: 'shift+Tab', command: 'prevSplit', label: 'Previous split' },
  { keys: 'g i', command: 'goImportant', label: 'Go to Important' },
  { keys: 'g o', command: 'goOther', label: 'Go to Other' },
  { keys: 'g s', command: 'goStarred', label: 'Go to Starred' },
  { keys: 'g h', command: 'goSnoozed', label: 'Go to Snoozed' },
  { keys: 'g t', command: 'goSent', label: 'Go to Sent' },
  { keys: 'g d', command: 'goDrafts', label: 'Go to Drafts' },
  { keys: 'g e', command: 'goDone', label: 'Go to Done' },
  { keys: 'meta+j', command: 'summarize', label: 'AI: summarize conversation' },
  { keys: 'meta+shift+r', command: 'draftReply', label: 'AI: draft a reply' },
  { keys: 'shift+/', command: 'help', label: 'Keyboard shortcuts' },
  { keys: 'meta+r', command: 'refresh', label: 'Refresh' },
]

export function chordOf(event: KeyEventLike): string {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('meta')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey && event.key === '?') return 'shift+/'
  // Shift on a letter already changes the key itself, so it only matters alongside another modifier or a named key.
  if (event.shiftKey && (event.key.length > 1 || event.metaKey || event.ctrlKey || event.altKey)) parts.push('shift')
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key)
  return parts.join('+')
}

export class KeySequencer {
  private pending: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly prefixes: Set<string>

  constructor(private readonly bindings = BINDINGS) {
    this.prefixes = new Set(
      bindings.map((binding) => binding.keys.split(' ')).filter((parts) => parts.length > 1).map((parts) => parts[0] ?? ''),
    )
  }

  /** Returns the matched command, or null when the chord is unbound or starts a sequence. */
  feed(event: KeyEventLike): Command | null {
    const chord = chordOf(event)
    if (this.pending) {
      const sequence = `${this.pending} ${chord}`
      this.clearPending()
      const match = this.bindings.find((binding) => binding.keys === sequence)
      if (match) return match.command
    }
    if (this.prefixes.has(chord)) {
      this.pending = chord
      this.timer = setTimeout(() => this.clearPending(), 1200)
      return null
    }
    return this.bindings.find((binding) => binding.keys === chord)?.command ?? null
  }

  private clearPending(): void {
    this.pending = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

export const SNOOZE_PRESETS: { id: string; label: string; until: (now: Date) => Date }[] = [
  {
    id: 'later',
    label: 'Later today',
    until: (now) => {
      const date = new Date(now)
      date.setHours(date.getHours() + 3, 0, 0, 0)
      return date
    },
  },
  {
    id: 'evening',
    label: 'This evening',
    until: (now) => {
      const date = new Date(now)
      date.setHours(18, 0, 0, 0)
      if (date <= now) date.setDate(date.getDate() + 1)
      return date
    },
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow morning',
    until: (now) => {
      const date = new Date(now)
      date.setDate(date.getDate() + 1)
      date.setHours(8, 0, 0, 0)
      return date
    },
  },
  {
    id: 'weekend',
    label: 'This weekend',
    until: (now) => {
      const date = new Date(now)
      const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7
      date.setDate(date.getDate() + daysUntilSaturday)
      date.setHours(9, 0, 0, 0)
      return date
    },
  },
  {
    id: 'nextweek',
    label: 'Next week',
    until: (now) => {
      const date = new Date(now)
      const daysUntilMonday = (8 - date.getDay()) % 7 || 7
      date.setDate(date.getDate() + daysUntilMonday)
      date.setHours(8, 0, 0, 0)
      return date
    },
  },
]
