import type { ThreadSummary } from './types'

/**
 * Search syntax shared by Superhuman and Gmail: bare words (ANDed), "exact phrases",
 * OR, -negation, parentheses, and operators like from:, to:, subject:, in:, is:, has:,
 * label:, before:, after:, older_than:, newer_than:.
 */
export type SearchNode =
  | { type: 'term'; value: string; exact: boolean }
  | { type: 'op'; key: string; value: string }
  | { type: 'not'; child: SearchNode }
  | { type: 'and'; children: SearchNode[] }
  | { type: 'or'; children: SearchNode[] }

export const OPERATORS = ['from', 'to', 'cc', 'bcc', 'subject', 'in', 'is', 'has', 'label', 'before', 'after', 'older_than', 'newer_than', 'filename', 'list', 'category']

export const OPERATOR_HINTS: { syntax: string; hint: string }[] = [
  { syntax: 'from:', hint: 'Sender name or address' },
  { syntax: 'to:', hint: 'Recipient' },
  { syntax: 'has:attachment', hint: 'Messages with attachments' },
  { syntax: 'is:unread', hint: 'Unread conversations' },
  { syntax: 'in:sent', hint: 'Mail you sent' },
  { syntax: 'subject:', hint: 'Words in the subject' },
  { syntax: 'before:2026/01/31', hint: 'Sent before a date' },
  { syntax: 'after:2026/01/01', hint: 'Sent after a date' },
  { syntax: 'older_than:3m', hint: 'Older than 3 months (d, w, m, y)' },
  { syntax: '"exact phrase"', hint: 'Exact match' },
  { syntax: '-word', hint: 'Exclude a word' },
  { syntax: 'a OR b', hint: 'Either term' },
]

type Token = { kind: 'word'; value: string; quoted: boolean; negated: boolean } | { kind: 'or' } | { kind: 'open'; negated: boolean } | { kind: 'close' }

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const char = input[i] ?? ''
    if (/\s/.test(char)) {
      i++
      continue
    }
    let negated = false
    if (char === '-' && i + 1 < input.length && !/\s/.test(input[i + 1] ?? '')) {
      negated = true
      i++
    }
    const current = input[i] ?? ''
    if (current === '(') {
      tokens.push({ kind: 'open', negated })
      i++
      continue
    }
    if (current === ')') {
      tokens.push({ kind: 'close' })
      i++
      continue
    }
    if (current === '"') {
      const end = input.indexOf('"', i + 1)
      const value = end < 0 ? input.slice(i + 1) : input.slice(i + 1, end)
      tokens.push({ kind: 'word', value, quoted: true, negated })
      i = end < 0 ? input.length : end + 1
      continue
    }
    let j = i
    // Allow from:"Jane Doe"
    while (j < input.length && !/[\s()]/.test(input[j] ?? '')) {
      if (input[j] === '"') {
        const end = input.indexOf('"', j + 1)
        j = end < 0 ? input.length : end + 1
      } else j++
    }
    const value = input.slice(i, j)
    if (value === 'OR' || value === '|') tokens.push({ kind: 'or' })
    else if (value) tokens.push({ kind: 'word', value, quoted: false, negated })
    i = j
  }
  return tokens
}

export function parseSearch(input: string): SearchNode {
  const tokens = tokenize(input)
  let pos = 0
  const atom = (): SearchNode | null => {
    const token = tokens[pos]
    if (!token) return null
    if (token.kind === 'open') {
      pos++
      const inner = orExpr()
      if (tokens[pos]?.kind === 'close') pos++
      return token.negated ? { type: 'not', child: inner } : inner
    }
    if (token.kind !== 'word') return null
    pos++
    let node: SearchNode
    const colon = token.quoted ? -1 : token.value.indexOf(':')
    const key = colon > 0 ? token.value.slice(0, colon).toLowerCase() : ''
    if (colon > 0 && OPERATORS.includes(key)) node = { type: 'op', key, value: token.value.slice(colon + 1).replace(/^"|"$/g, '') }
    else node = { type: 'term', value: token.value, exact: token.quoted }
    return token.negated ? { type: 'not', child: node } : node
  }
  const andExpr = (): SearchNode => {
    const children: SearchNode[] = []
    while (pos < tokens.length && tokens[pos]?.kind !== 'or' && tokens[pos]?.kind !== 'close') {
      const node = atom()
      if (!node) {
        pos++
        continue
      }
      children.push(node)
    }
    return children.length === 1 ? (children[0] as SearchNode) : { type: 'and', children }
  }
  const orExpr = (): SearchNode => {
    const children = [andExpr()]
    while (tokens[pos]?.kind === 'or') {
      pos++
      children.push(andExpr())
    }
    return children.length === 1 ? (children[0] as SearchNode) : { type: 'or', children }
  }
  return orExpr()
}

/** Serialize back to a Gmail `q` string (normalized). */
export function toGmailQuery(node: SearchNode): string {
  switch (node.type) {
    case 'term':
      return node.exact ? `"${node.value}"` : node.value
    case 'op':
      return /\s/.test(node.value) ? `${node.key}:"${node.value}"` : `${node.key}:${node.value}`
    case 'not':
      return `-${node.child.type === 'and' || node.child.type === 'or' ? `(${toGmailQuery(node.child)})` : toGmailQuery(node.child)}`
    case 'and':
      return node.children.map((child) => (child.type === 'or' ? `(${toGmailQuery(child)})` : toGmailQuery(child))).join(' ')
    case 'or':
      return node.children.map(toGmailQuery).join(' OR ')
  }
}

function parseAge(value: string): number | null {
  const match = /^(\d+)([dwmy])$/.exec(value)
  if (!match) return null
  const days = { d: 1, w: 7, m: 30, y: 365 }[match[2] as 'd' | 'w' | 'm' | 'y']
  return Number(match[1]) * days * 86_400_000
}

function parseDate(value: string): number | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
}

/** Evaluate a query against a thread summary locally (demo inbox, offline cache). */
export function matchThread(node: SearchNode, thread: ThreadSummary, now = Date.now()): boolean {
  const haystack = `${thread.subject} ${thread.snippet} ${thread.participants.map((p) => `${p.name} ${p.email}`).join(' ')}`.toLowerCase()
  const people = thread.participants.map((p) => `${p.name} ${p.email}`.toLowerCase())
  switch (node.type) {
    case 'term':
      return haystack.includes(node.value.toLowerCase())
    case 'not':
      return !matchThread(node.child, thread, now)
    case 'and':
      return node.children.every((child) => matchThread(child, thread, now))
    case 'or':
      return node.children.some((child) => matchThread(child, thread, now))
    case 'op': {
      const value = node.value.toLowerCase()
      switch (node.key) {
        case 'from':
        case 'to':
        case 'cc':
        case 'bcc':
          return people.some((person) => person.includes(value))
        case 'subject':
          return thread.subject.toLowerCase().includes(value)
        case 'is':
          if (value === 'unread') return thread.unread
          if (value === 'read') return !thread.unread
          if (value === 'starred' || value === 'flagged') return thread.starred
          return thread.labelIds.map((l) => l.toLowerCase()).includes(value)
        case 'in':
        case 'label':
          return thread.labelIds.some((label) => label.toLowerCase() === value || label.toLowerCase() === `label_${value}`)
        case 'has':
          return value === 'attachment' ? thread.labelIds.includes('HAS_ATTACHMENT') : false
        case 'older_than': {
          const age = parseAge(value)
          return age !== null && now - thread.lastDate > age
        }
        case 'newer_than': {
          const age = parseAge(value)
          return age !== null && now - thread.lastDate <= age
        }
        case 'before': {
          const date = parseDate(value)
          return date !== null && thread.lastDate < date
        }
        case 'after': {
          const date = parseDate(value)
          return date !== null && thread.lastDate >= date
        }
        default:
          return haystack.includes(value)
      }
    }
  }
}

/** Words to highlight in results (positive terms and operator values that match text). */
export function highlightTerms(node: SearchNode): string[] {
  switch (node.type) {
    case 'term':
      return [node.value]
    case 'op':
      return ['from', 'to', 'subject'].includes(node.key) ? [node.value] : []
    case 'not':
      return []
    case 'and':
    case 'or':
      return node.children.flatMap(highlightTerms)
  }
}
