import { matchThread, parseSearch } from '@shared/search'
import type { Address, FullMessage, OutgoingMail, Split, Thread, ThreadSummary } from '@shared/types'
import type { Page } from './gmail'

export const DEMO_EMAIL = 'you@duperhuman.local'

const people: Record<string, Address> = {
  ada: { name: 'Ada Lovelace', email: 'ada@analytical.engine' },
  grace: { name: 'Grace Hopper', email: 'grace@navy.mil' },
  linus: { name: 'Linus Torvalds', email: 'linus@kernel.org' },
  margaret: { name: 'Margaret Hamilton', email: 'margaret@apollo.nasa.gov' },
  alan: { name: 'Alan Turing', email: 'alan@bletchley.park' },
  me: { name: 'You', email: DEMO_EMAIL },
  stripe: { name: 'Stripe', email: 'receipts@stripe.com' },
  github: { name: 'GitHub', email: 'notifications@github.com' },
  substack: { name: 'Stratechery', email: 'ben@stratechery.com' },
  linear: { name: 'Linear', email: 'notifications@linear.app' },
  figma: { name: 'Figma', email: 'news@figma.com' },
}

const HOUR = 3_600_000
const now = Date.now()

interface Seed {
  id: string
  subject: string
  labels: string[]
  unread?: boolean
  starred?: boolean
  messages: { from: Address; to: Address[]; ago: number; text: string }[]
}

const seeds: Seed[] = [
  {
    id: 'd1',
    subject: 'Board deck: numbers for Thursday',
    labels: ['INBOX', 'CATEGORY_PERSONAL'],
    unread: true,
    messages: [
      { from: people.ada!, to: [people.me!], ago: 0.4, text: 'Hi,\n\nCan you send me the final retention numbers before Thursday? I want to put them on slide 4 next to the cohort chart.\n\nAlso, do we want to show the pricing experiment, or hold that until we have another month of data?\n\nAda' },
    ],
  },
  {
    id: 'd2',
    subject: 'Re: Offer letter',
    labels: ['INBOX', 'CATEGORY_PERSONAL'],
    unread: true,
    starred: true,
    messages: [
      { from: people.me!, to: [people.grace!], ago: 30, text: 'Grace, attached is the offer. Let me know if the start date works.' },
      { from: people.grace!, to: [people.me!], ago: 2, text: 'Thank you! The start date works. One question: is the equity vesting monthly or quarterly after the cliff?\n\nGrace' },
    ],
  },
  {
    id: 'd3',
    subject: 'Dinner Saturday?',
    labels: ['INBOX', 'CATEGORY_PERSONAL'],
    messages: [
      { from: people.alan!, to: [people.me!, people.margaret!], ago: 5, text: 'We have a table at 7 if you two are free. No pressure.' },
      { from: people.margaret!, to: [people.me!, people.alan!], ago: 4, text: 'I am in. Tommy?' },
    ],
  },
  {
    id: 'd4',
    subject: 'Kernel patch review: scheduler latency',
    labels: ['INBOX', 'CATEGORY_PERSONAL'],
    unread: true,
    messages: [
      { from: people.linus!, to: [people.me!], ago: 9, text: 'Your patch looks fine, but the commit message explains what the code does instead of why. Rewrite it and resend.\n\nAlso the test only covers the fast path.' },
    ],
  },
  {
    id: 'd5',
    subject: 'Your receipt from Stripe',
    labels: ['INBOX', 'CATEGORY_UPDATES'],
    messages: [{ from: people.stripe!, to: [people.me!], ago: 3, text: 'Receipt #2041-8831\n\nAmount paid: $30.00\nSuperhuman monthly\n\nThis is the last one of these you will get.' }],
  },
  {
    id: 'd6',
    subject: '[muckstack/duperhuman] PR #1: Keyboard-first inbox (opened)',
    labels: ['INBOX', 'CATEGORY_UPDATES'],
    unread: true,
    messages: [{ from: people.github!, to: [people.me!], ago: 1, text: 'A new pull request was opened.\n\nKeyboard-first inbox with split tabs, snooze, and AI drafts.\n\nView it on GitHub.' }],
  },
  {
    id: 'd7',
    subject: 'The End of Software',
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    messages: [{ from: people.substack!, to: [people.me!], ago: 20, text: 'When the marginal cost of building a CRUD app approaches zero, what is a SaaS company actually selling?\n\nThis week we look at the per-seat model...' }],
  },
  {
    id: 'd8',
    subject: 'Linear: 3 issues assigned to you',
    labels: ['INBOX', 'CATEGORY_UPDATES'],
    messages: [{ from: people.linear!, to: [people.me!], ago: 26, text: 'DUP-12 Snooze menu keyboard nav\nDUP-13 Undo toast timing\nDUP-14 Dark theme contrast pass' }],
  },
  {
    id: 'd9',
    subject: 'Config 2026 recordings are live',
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    messages: [{ from: people.figma!, to: [people.me!], ago: 50, text: 'Every talk from Config, now on demand.' }],
  },
  {
    id: 'd10',
    subject: 'Intro: Margaret <> you',
    labels: ['INBOX', 'CATEGORY_PERSONAL'],
    messages: [
      { from: people.alan!, to: [people.me!, people.margaret!], ago: 70, text: 'Margaret, meet Tommy. Tommy is building an email client that replaces the one you pay for. Margaret ran software for Apollo and has opinions about reliability.\n\nI will let you two take it from here.' },
    ],
  },
]

function build(seed: Seed): Thread {
  const messages: FullMessage[] = seed.messages.map((message, index) => ({
    id: `${seed.id}-m${index}`,
    threadId: seed.id,
    from: message.from,
    to: message.to,
    cc: [],
    subject: seed.subject,
    snippet: message.text.replace(/\s+/g, ' ').slice(0, 120),
    date: now - message.ago * HOUR,
    labelIds: seed.labels,
    unread: Boolean(seed.unread) && index === seed.messages.length - 1,
    starred: Boolean(seed.starred),
    body: { html: null, text: message.text, messageId: `<${seed.id}-m${index}@demo>`, references: null, attachments: [] },
  }))
  const last = messages[messages.length - 1]
  const participants = messages.flatMap((message) => [message.from, ...message.to]).filter((address, index, all) => all.findIndex((entry) => entry.email === address.email) === index)
  return {
    id: seed.id,
    subject: seed.subject,
    snippet: last?.snippet ?? '',
    participants: participants.filter((address) => address.email !== DEMO_EMAIL),
    lastDate: last?.date ?? now,
    messageCount: messages.length,
    unread: Boolean(seed.unread),
    starred: Boolean(seed.starred),
    labelIds: seed.labels,
    messages,
  }
}

const store = new Map<string, Thread>(seeds.map((seed) => [seed.id, build(seed)]))
const OTHER = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS']

function summary(thread: Thread): ThreadSummary {
  const { messages: _messages, ...rest } = thread
  return rest
}

export const demo = {
  listThreads(split: Split, search?: string): Page {
    const query = search?.trim() ? parseSearch(search) : null
    const threads = [...store.values()]
      .filter((thread) => {
        const inbox = thread.labelIds.includes('INBOX')
        const other = thread.labelIds.some((label) => OTHER.includes(label))
        switch (split) {
          case 'important': return inbox && !other
          case 'other': return inbox && other
          case 'starred': return thread.starred
          case 'sent': return thread.messages.some((message) => message.from.email === DEMO_EMAIL)
          case 'done': return !inbox && !thread.labelIds.includes('TRASH') && !thread.labelIds.includes('SPAM')
          case 'spam': return thread.labelIds.includes('SPAM')
          case 'trash': return thread.labelIds.includes('TRASH')
          case 'all': return true
          default: return false
        }
      })
      .map(summary)
      .filter((thread) => !query || matchThread(query, thread))
      .sort((a, b) => b.lastDate - a.lastDate)
    return { threads }
  },
  getThread(id: string): Thread {
    const thread = store.get(id)
    if (!thread) throw new Error('Demo thread not found')
    return structuredClone(thread)
  },
  modify(id: string, add: string[], remove: string[]): void {
    const thread = store.get(id)
    if (!thread) return
    const labels = new Set(thread.labelIds)
    add.forEach((label) => labels.add(label))
    remove.forEach((label) => labels.delete(label))
    thread.labelIds = [...labels]
    thread.unread = labels.has('UNREAD') || (thread.unread && !remove.includes('UNREAD'))
    if (remove.includes('UNREAD')) thread.unread = false
    if (add.includes('UNREAD')) thread.unread = true
    thread.starred = labels.has('STARRED') || (thread.starred && !remove.includes('STARRED'))
    if (remove.includes('STARRED')) thread.starred = false
    if (add.includes('STARRED')) thread.starred = true
    thread.messages.forEach((message) => {
      message.labelIds = thread.labelIds
      message.starred = thread.starred
    })
  },
  send(mail: OutgoingMail): void {
    const threadId = mail.threadId ?? `d${store.size + 1}`
    const existing = store.get(threadId)
    const message: FullMessage = {
      id: `${threadId}-m${(existing?.messages.length ?? 0) + 1}`,
      threadId,
      from: people.me!,
      to: mail.to.map((email) => ({ name: email, email })),
      cc: [],
      subject: mail.subject,
      snippet: mail.text.replace(/\s+/g, ' ').slice(0, 120),
      date: Date.now(),
      labelIds: ['SENT'],
      unread: false,
      starred: false,
      body: { html: null, text: mail.text, messageId: null, references: null, attachments: [] },
    }
    if (existing) {
      existing.messages.push(message)
      existing.lastDate = message.date
      existing.messageCount += 1
      existing.snippet = message.snippet
    } else {
      store.set(threadId, { id: threadId, subject: mail.subject, snippet: message.snippet, participants: message.to, lastDate: message.date, messageCount: 1, unread: false, starred: false, labelIds: ['SENT'], messages: [message] })
    }
  },
}
