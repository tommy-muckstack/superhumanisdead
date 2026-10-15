/**
 * Superhuman's keyboard map (docs/SUPERHUMAN_SPEC.md, "Keyboard shortcuts").
 * `scope: 'global'` bindings run from the inbox; `scope: 'compose'` bindings are handled
 * inside the composer and listed here so the palette and cheat sheet can show them.
 */
export type Command =
  // navigation
  | 'next' | 'prev' | 'open' | 'back' | 'top' | 'bottom' | 'nextSplit' | 'prevSplit'
  // conversations
  | 'done' | 'notDone' | 'snooze' | 'star' | 'unread' | 'trash' | 'spam' | 'select' | 'extendNext' | 'extendPrev' | 'selectAll'
  // messages
  | 'reply' | 'replyAll' | 'forward' | 'compose' | 'expandAll'
  // actions
  | 'palette' | 'search' | 'undo' | 'askAi' | 'help' | 'refresh' | 'snippets'
  // folders
  | 'goImportant' | 'goOther' | 'goStarred' | 'goSnoozed' | 'goSent' | 'goDrafts' | 'goDone' | 'goSpam' | 'goTrash' | 'goAll' | 'goSnippets'
  // AI
  | 'summarize' | 'draftReply'
  // calendar
  | 'calendar' | 'calToday' | 'calPrev' | 'calNext' | 'shareAvailability'
  // compose (handled by the composer)
  | 'send' | 'sendNow' | 'sendDone' | 'sendLater' | 'remindCompose' | 'useSnippet' | 'writeAi' | 'discard'
  | 'focusTo' | 'focusCc' | 'focusBcc' | 'focusSubject' | 'focusBody'
  // misc
  | 'triage' | 'theme'
  // reading
  | 'nextMessage' | 'prevMessage' | 'expandMessage' | 'pageDown' | 'pageUp' | 'folderMenu' | 'openLinks' | 'print'
  // organize
  | 'move' | 'label' | 'removeLabel' | 'removeAllLabels' | 'removeLabelNext' | 'removeLabelPrev' | 'unsubscribe' | 'mute'
  // accounts
  | 'account1' | 'account2' | 'account3' | 'account4' | 'account5' | 'account6' | 'account7' | 'account8' | 'account9'
  // pop out
  | 'composePop' | 'replyPop' | 'replyAllPop' | 'forwardPop' | 'popSearch'
  // calendar
  | 'calWeek' | 'createEvent' | 'createEmptyEvent'
  // compose extras
  | 'popToggle' | 'focusToggle' | 'attach' | 'instantIntro' | 'focusFrom'
  | 'bold' | 'italic' | 'underline' | 'link' | 'strike' | 'numbered' | 'bullets' | 'quote'

export type Section = 'Actions' | 'Navigation' | 'Conversations' | 'Messages' | 'Compose' | 'Format' | 'Folders' | 'Calendar' | 'AI' | 'Accounts'

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface Binding {
  /** Chords separated by spaces for sequences; '' = palette only. */
  keys: string
  command: Command
  label: string
  section: Section
  scope: 'global' | 'compose'
}

const g = (keys: string, command: Command, label: string, section: Section): Binding => ({ keys, command, label, section, scope: 'global' })
const c = (keys: string, command: Command, label: string, section: Section = 'Compose'): Binding => ({ keys, command, label, section, scope: 'compose' })

export const BINDINGS: Binding[] = [
  g('meta+k', 'palette', 'Command palette', 'Actions'),
  g('/', 'search', 'Search', 'Actions'),
  g('z', 'undo', 'Undo', 'Actions'),
  g('?', 'askAi', 'Ask AI', 'Actions'),
  g('', 'help', 'Keyboard shortcuts', 'Actions'),
  g('meta+r', 'refresh', 'Refresh', 'Actions'),
  g('j', 'next', 'Next conversation', 'Navigation'),
  g('k', 'prev', 'Previous conversation', 'Navigation'),
  g('ArrowDown', 'next', 'Next conversation', 'Navigation'),
  g('ArrowUp', 'prev', 'Previous conversation', 'Navigation'),
  g('Escape', 'back', 'Back / clear selection', 'Navigation'),
  g('meta+ArrowUp', 'top', 'Jump to top', 'Navigation'),
  g('meta+ArrowDown', 'bottom', 'Jump to bottom', 'Navigation'),
  g('Tab', 'nextSplit', 'Next split', 'Navigation'),
  g('shift+Tab', 'prevSplit', 'Previous split', 'Navigation'),
  g('e', 'done', 'Mark done', 'Conversations'),
  g('shift+e', 'notDone', 'Mark not done', 'Conversations'),
  g('h', 'snooze', 'Remind me', 'Conversations'),
  g('s', 'star', 'Star', 'Conversations'),
  g('u', 'unread', 'Mark read or unread', 'Conversations'),
  g('#', 'trash', 'Trash', 'Conversations'),
  g('!', 'spam', 'Mark as spam', 'Conversations'),
  g('x', 'select', 'Select conversation', 'Conversations'),
  g('shift+j', 'extendNext', 'Add next to selection', 'Conversations'),
  g('shift+k', 'extendPrev', 'Add previous to selection', 'Conversations'),
  g('meta+a', 'selectAll', 'Select all', 'Conversations'),
  g('c', 'compose', 'Compose', 'Messages'),
  g('Enter', 'replyAll', 'Reply all', 'Messages'),
  g('r', 'reply', 'Reply', 'Messages'),
  g('a', 'replyAll', 'Reply all', 'Messages'),
  g('f', 'forward', 'Forward', 'Messages'),
  g('shift+o', 'expandAll', 'Expand all messages', 'Messages'),
  g('g i', 'goImportant', 'Go to Important', 'Folders'),
  g('g o', 'goOther', 'Go to Other', 'Folders'),
  g('g s', 'goStarred', 'Go to Starred', 'Folders'),
  g('g d', 'goDrafts', 'Go to Drafts', 'Folders'),
  g('g t', 'goSent', 'Go to Sent', 'Folders'),
  g('g e', 'goDone', 'Go to Done', 'Folders'),
  g('g h', 'goSnoozed', 'Go to Reminders', 'Folders'),
  g('g ;', 'goSnippets', 'Go to Snippets', 'Folders'),
  g('g !', 'goSpam', 'Go to Spam', 'Folders'),
  g('g #', 'goTrash', 'Go to Trash', 'Folders'),
  g('g a', 'goAll', 'Go to All Mail', 'Folders'),
  g('meta+j', 'summarize', 'Summarize conversation', 'AI'),
  g('meta+shift+r', 'draftReply', 'Draft a reply with AI', 'AI'),
  g('', 'triage', 'Sort this list with AI', 'AI'),
  g('0', 'calendar', 'Show or hide calendar', 'Calendar'),
  g('t', 'calToday', 'Calendar: today', 'Calendar'),
  g('-', 'calPrev', 'Calendar: previous day', 'Calendar'),
  g('=', 'calNext', 'Calendar: next day', 'Calendar'),
  g('', 'shareAvailability', 'Share availability', 'Calendar'),
  g('n', 'nextMessage', 'Next message', 'Navigation'),
  g('p', 'prevMessage', 'Previous message', 'Navigation'),
  g('ArrowLeft', 'folderMenu', 'Folder menu', 'Navigation'),
  g('Space', 'pageDown', 'Page down', 'Navigation'),
  g('shift+Space', 'pageUp', 'Page up', 'Navigation'),
  g('o', 'expandMessage', 'Expand message', 'Messages'),
  g('meta+o', 'openLinks', 'Open links and attachments', 'Messages'),
  g('meta+p', 'print', 'Print', 'Messages'),
  g('v', 'move', 'Move', 'Conversations'),
  g('l', 'label', 'Add or remove label', 'Conversations'),
  g('y', 'removeLabel', 'Remove label', 'Conversations'),
  g('shift+y', 'removeAllLabels', 'Remove all labels', 'Conversations'),
  g('[', 'removeLabelNext', 'Remove label, then next', 'Conversations'),
  g(']', 'removeLabelPrev', 'Remove label, then previous', 'Conversations'),
  g('meta+u', 'unsubscribe', 'Unsubscribe', 'Conversations'),
  g('shift+m', 'mute', 'Mute', 'Conversations'),
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => g(`ctrl+${n}`, `account${n}` as Command, `Switch to account ${n}`, 'Accounts')),
  g('shift+c', 'composePop', 'Compose, popped out', 'Messages'),
  g('shift+r', 'replyPop', 'Reply, popped out', 'Messages'),
  g('shift+Enter', 'replyAllPop', 'Reply all, popped out', 'Messages'),
  g('shift+f', 'forwardPop', 'Forward, popped out', 'Messages'),
  g('meta+/', 'popSearch', 'Pop out draft and search', 'Actions'),
  g('2', 'calWeek', 'Calendar: week view', 'Calendar'),
  g('b', 'createEvent', 'Create event', 'Calendar'),
  g('shift+b', 'createEmptyEvent', 'Create empty event', 'Calendar'),
  c('meta+Enter', 'send', 'Send'),
  c('meta+shift+p', 'popToggle', 'Pop draft out or in'),
  c('meta+d', 'focusToggle', 'Toggle focus between draft and thread'),
  c('meta+shift+a', 'attach', 'Attach'),
  c('meta+shift+i', 'instantIntro', 'Instant Intro (move to Bcc)'),
  c('meta+shift+f', 'focusFrom', 'Edit From'),
  c('meta+b', 'bold', 'Bold', 'Format'),
  c('meta+i', 'italic', 'Italic', 'Format'),
  c('meta+u', 'underline', 'Underline', 'Format'),
  c('meta+k', 'link', 'Hyperlink (with text selected)', 'Format'),
  c('meta+shift+x', 'strike', 'Strikethrough', 'Format'),
  c('meta+shift+7', 'numbered', 'Numbered list', 'Format'),
  c('meta+shift+8', 'bullets', 'Bullets', 'Format'),
  c('meta+shift+9', 'quote', 'Quote', 'Format'),
  c('meta+shift+z', 'sendNow', 'Send instantly (skip undo)'),
  c('meta+shift+Enter', 'sendDone', 'Send and mark done'),
  c('meta+shift+l', 'sendLater', 'Send later'),
  c('meta+shift+h', 'remindCompose', 'Remind me if no reply'),
  c('meta+;', 'useSnippet', 'Use snippet'),
  c('meta+j', 'writeAi', 'Write with AI'),
  c('meta+shift+,', 'discard', 'Discard draft'),
  c('meta+shift+o', 'focusTo', 'Edit To'),
  c('meta+shift+c', 'focusCc', 'Edit Cc'),
  c('meta+shift+b', 'focusBcc', 'Edit Bcc'),
  c('meta+shift+s', 'focusSubject', 'Edit subject'),
  c('meta+shift+m', 'focusBody', 'Edit message'),
]

/** Shifted punctuation reported by US layouts with ⌘⇧ held. */
const SHIFTED: Record<string, string> = { '<': ',', '>': '.', ':': ';', '"': "'", '{': '[', '}': ']', '+': '=', _: '-', '&': '7', '*': '8', '(': '9', '?': '/' }

export function chordOf(event: KeyEventLike): string {
  const parts: string[] = []
  const meta = event.metaKey
  if (meta) parts.push('meta')
  if (event.ctrlKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  let key = event.key === ' ' ? 'Space' : event.key
  if (key.length === 1) {
    const letter = /^[a-z]$/i.test(key)
    if (letter) {
      if (event.shiftKey) parts.push('shift')
      key = key.toLowerCase()
    } else if ((meta || event.ctrlKey) && event.shiftKey) {
      parts.push('shift')
      key = SHIFTED[key] ?? key
    }
    // Plain shifted punctuation (?, #, !) is matched by the character itself.
  } else if (event.shiftKey) parts.push('shift')
  if (key === ' ') key = 'Space'
  parts.push(key)
  return parts.join('+')
}

/** Display a chord sequence as keycaps: "meta+shift+l" -> ["⌘⇧L"], "g i" -> ["G", "I"]. */
export function keycaps(keys: string): string[] {
  if (!keys) return []
  const names: Record<string, string> = { meta: '⌘', ctrl: '⌃', shift: '⇧', alt: '⌥', ArrowLeft: '←', Enter: '↵', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', Tab: 'Tab', Space: 'Space' }
  return keys.split(' ').map((chord) =>
    chord
      .split('+')
      .map((part) => names[part] ?? (part.length === 1 ? part.toUpperCase() : part))
      .join(''),
  )
}

export function bindingFor(command: Command): Binding | undefined {
  return BINDINGS.find((binding) => binding.command === command && binding.keys)
}

export class KeySequencer {
  private pending: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly prefixes: Set<string>
  private readonly bindings: Binding[]

  constructor(bindings = BINDINGS, private readonly timeoutMs = 1200) {
    this.bindings = bindings.filter((binding) => binding.scope === 'global' && binding.keys)
    this.prefixes = new Set(
      this.bindings.map((binding) => binding.keys.split(' ')).filter((parts) => parts.length > 1).map((parts) => parts[0] ?? ''),
    )
  }

  /** Returns the matched command, or null when the chord is unbound or starts a sequence. */
  feed(event: KeyEventLike): Command | null {
    const exact = chordOf(event)
    // Off macOS, Ctrl stands in for ⌘ unless the chord is itself a Ctrl binding (Ctrl+1–9).
    const chord = this.bindings.some((binding) => binding.keys === exact) || !exact.startsWith('ctrl+') ? exact : exact.replace(/^ctrl\+/, 'meta+')
    if (this.pending) {
      const sequence = `${this.pending} ${chord}`
      this.clearPending()
      const match = this.bindings.find((binding) => binding.keys === sequence)
      if (match) return match.command
    }
    if (this.prefixes.has(chord)) {
      this.pending = chord
      this.timer = setTimeout(() => this.clearPending(), this.timeoutMs)
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

/** Composer shortcut lookup (no sequences). */
export function composeCommand(event: KeyEventLike): Command | null {
  const chord = chordOf(event).replace(/^ctrl\+/, 'meta+')
  return BINDINGS.find((binding) => binding.scope === 'compose' && binding.keys === chord)?.command ?? null
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
