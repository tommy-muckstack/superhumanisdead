import { messageText } from './gmail-parse'
import type { AiRequest } from './types'

/** Prompt construction shared by every AI provider. */
export const MAX_THREAD_CHARS = 60_000

export const REWRITES = {
  improve: 'Improve the writing: fix grammar, tighten wording, keep the meaning and tone.',
  shorten: 'Make it noticeably shorter. Keep every fact and request.',
  lengthen: 'Expand it a little with helpful detail, without padding.',
  simplify: 'Use simpler words and shorter sentences.',
  voice: "Rewrite it in the user's own voice, using their previous emails as a guide: direct, warm, concise.",
} as const
export type RewriteStyle = keyof typeof REWRITES

export function threadTranscript(request: AiRequest, max = MAX_THREAD_CHARS): string {
  const thread = request.thread
  if (!thread) return ''
  const lines: string[] = [`Subject: ${thread.subject}`, '']
  for (const message of thread.messages) {
    const when = new Date(message.date).toISOString()
    lines.push(`--- From: ${message.from.name} <${message.from.email}> | To: ${message.to.map((address) => address.email).join(', ')} | ${when}`)
    lines.push(messageText(message))
    lines.push('')
  }
  const transcript = lines.join('\n')
  if (transcript.length <= max) return transcript
  return `[earlier messages trimmed]\n${transcript.slice(-max)}`
}

function inboxListing(request: AiRequest): string {
  return (request.threads ?? [])
    .slice(0, 200)
    .map((t) => `[${t.id}] ${new Date(t.lastDate).toISOString().slice(0, 10)} | ${t.participants.map((p) => p.name || p.email).join(', ')} | ${t.subject} | ${t.snippet.slice(0, 200)}`)
    .join('\n')
}

export function systemPrompt(request: AiRequest): string {
  const me = request.me ? `The user is ${request.me}.` : ''
  const persona = request.persona ? ` About the user: ${request.persona}` : ''
  const base = `You are the assistant inside an email client. ${me}${persona}`
  switch (request.kind) {
    case 'summarize':
      return `${base} Summarize the conversation in ONE sentence of at most 18 words, like a subtitle under the subject line. No preamble.`
    case 'draft':
      return `${base} Write the reply the user would send, in their voice: direct, warm, short. Output only the email body, no subject line, no quoted text, no placeholder like [Name]. ${request.instruction ? `Follow this instruction from the user: ${request.instruction}` : 'Reply to the latest message.'}`
    case 'instantReplies':
      return `${base} Suggest exactly three very short replies (2 to 6 words each) the user could send to the latest message, ranging from positive to declining. Output them as three lines, nothing else.`
    case 'write':
      return `${base} Turn the user's notes into a complete email. Output the first line as "Subject: ..." then a blank line, then the body, signed with the user's first name. Never invent facts beyond the notes.`
    case 'rewrite':
      return `${base} ${REWRITES[(request.style as RewriteStyle) ?? 'improve'] ?? REWRITES.improve} Output only the rewritten text.`
    case 'ask':
      return `${base} Answer the user's question about this conversation briefly and concretely. Plain text only.`
    case 'askInbox':
      return `${base} Answer the user's question using only the listed conversations. Cite conversations inline as [n] where n is the 1-based position in the list. Use short markdown bullets. If the answer is not in the list, say so.`
    case 'label':
      return `${base} Classify each conversation into one of these labels: ${(request.labels ?? []).join(', ')}, or "none". Output one line per conversation as "<id> <label>".`
    case 'triage':
      return 'You sort email.'
  }
}

export function userPrompt(request: AiRequest): string {
  switch (request.kind) {
    case 'ask':
      return `${threadTranscript(request)}\n\nQuestion: ${request.instruction ?? ''}`
    case 'write':
      return `Notes: ${request.instruction ?? ''}${request.thread ? `\n\nThis is a reply in this conversation:\n${threadTranscript(request, 20_000)}` : ''}`
    case 'rewrite':
      return request.text ?? ''
    case 'askInbox':
      return `Conversations:\n${(request.threads ?? []).map((t, i) => `${i + 1}. ${inboxListing({ ...request, threads: [t] })}`).join('\n')}\n\nQuestion: ${request.instruction ?? ''}`
    case 'label':
      return inboxListing(request)
    default:
      return threadTranscript(request)
  }
}

/** Parse the three-line Instant Reply output. */
export function parseInstantReplies(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“]|["”]$/g, '').trim())
    .filter((line) => line.length > 0 && line.length <= 60)
    .slice(0, 3)
}

/** Split "Subject: ...\n\nbody" from Write with AI. */
export function parseWritten(text: string): { subject: string; body: string } {
  const match = /^\s*subject:\s*(.+)\n+([\s\S]*)$/i.exec(text)
  if (!match) return { subject: '', body: text.trim() }
  return { subject: (match[1] ?? '').trim(), body: (match[2] ?? '').trim() }
}

export function parseLabels(text: string, allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = /^\s*\[?([\w-]+)\]?\s+([\w-]+)\s*$/.exec(line)
    if (match && match[1] && match[2] && allowed.includes(match[2])) result[match[1]] = match[2]
  }
  return result
}
