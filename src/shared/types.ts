export type Split = 'important' | 'other' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'done'

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
}

export interface Settings {
  googleClientId: string
  googleClientSecret: string
  anthropicApiKey: string
  aiModel: string
  signature: string
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
  kind: 'summarize' | 'draft' | 'triage' | 'ask'
  thread?: Thread
  instruction?: string
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
