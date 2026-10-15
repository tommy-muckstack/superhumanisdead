export type Split = 'important' | 'other' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'done' | 'spam' | 'trash' | 'all'

import type { ScheduledSend } from './schedule'
import type { CalEvent } from './calendar'
export type { ScheduledSend, CalEvent }

export interface Address {
  name: string
  email: string
}

export interface MessageSummary {
  id: string
  threadId: string
  from: Address
  to: Address[]
  cc: Address[]
  subject: string
  snippet: string
  date: number
  labelIds: string[]
  unread: boolean
  starred: boolean
}

export interface MessageBody {
  html: string | null
  text: string | null
  messageId: string | null
  references: string | null
  attachments: { filename: string; mimeType: string; size: number; attachmentId: string }[]
}

export interface FullMessage extends MessageSummary {
  body: MessageBody
}

export interface ThreadSummary {
  id: string
  subject: string
  snippet: string
  participants: Address[]
  lastDate: number
  messageCount: number
  unread: boolean
  starred: boolean
  labelIds: string[]
  snoozedUntil?: number
}

export interface Thread extends ThreadSummary {
  messages: FullMessage[]
}

export interface Snooze {
  threadId: string
  until: number
  subject: string
  /** Only bring it back if nobody replied after `setAt`. */
  ifNoReply?: boolean
  setAt?: number
}

export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  googleClientId: string
  googleClientSecret: string
  /** Legacy name kept for stored settings; used as the key for the Anthropic provider. */
  anthropicApiKey: string
  aiModel: string
  /** 'anthropic' or any OpenAI-compatible endpoint. */
  aiProvider: 'anthropic' | 'openai'
  aiBaseUrl: string
  openaiApiKey: string
  /** One paragraph about the user, used by Write with AI and Instant Reply. */
  aiPersona: string
  signature: string
  theme: Theme
  undoSendSeconds: number
  remindWeekdaysOnly: boolean
  /** Optional pixel server for read statuses. Empty = off. */
  readStatusHost: string
  autoAdvance: 'older' | 'newer' | 'list'
  instantReplies: boolean
  autoSummarize: boolean
}

export interface Account {
  email: string
  signedIn: boolean
}

export interface OutgoingMail {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  text: string
  html?: string
  threadId?: string
  inReplyTo?: string | null
  references?: string | null
}

export interface AiRequest {
  kind: 'summarize' | 'draft' | 'triage' | 'ask' | 'instantReplies' | 'write' | 'rewrite' | 'askInbox' | 'label'
  thread?: Thread
  threads?: ThreadSummary[]
  instruction?: string
  /** Text to rewrite. */
  text?: string
  /** Rewrite style: improve | shorten | lengthen | simplify | voice. */
  style?: string
  labels?: string[]
  persona?: string
  me?: string
}

export interface TriageResult {
  threadId: string
  split: 'important' | 'other'
  reason: string
}

export interface DuperApi {
  settings: {
    get: () => Promise<Settings>
    set: (patch: Partial<Settings>) => Promise<Settings>
  }
  auth: {
    status: () => Promise<Account>
    signIn: () => Promise<Account>
    signOut: () => Promise<void>
  }
  gmail: {
    request: <T>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> }) => Promise<T>
  }
  snooze: {
    list: () => Promise<Snooze[]>
    add: (snooze: Snooze) => Promise<Snooze[]>
    remove: (threadId: string) => Promise<Snooze[]>
    onWake: (handler: (snooze: Snooze) => void) => () => void
  }
  ai: {
    complete: (request: AiRequest) => Promise<string>
    stream: (request: AiRequest, onChunk: (text: string) => void) => Promise<string>
    triage: (threads: ThreadSummary[], me: string) => Promise<TriageResult[]>
  }
  schedule: {
    list: () => Promise<ScheduledSend[]>
    add: (item: ScheduledSend) => Promise<ScheduledSend[]>
    /** Cancel before it goes out. Returns the cancelled item (to restore the draft), or null if already sent. */
    cancel: (id: string) => Promise<ScheduledSend | null>
    sendNow: (id: string) => Promise<ScheduledSend[]>
    onSent: (handler: (item: ScheduledSend, result: { threadId: string } | { error: string }) => void) => () => void
  }
  calendar: {
    events: (from: number, to: number) => Promise<CalEvent[]>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
}

declare global {
  interface Window {
    duper: DuperApi
    duperDemo?: boolean
  }
}
