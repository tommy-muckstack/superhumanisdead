import type { Store } from './store'
import type { AiRequest, ThreadSummary, TriageResult } from '@shared/types'
import { messageText } from '@shared/gmail-parse'

const API = 'https://api.anthropic.com/v1/messages'
const MAX_THREAD_CHARS = 60_000

interface ContentBlock {
  type: string
  text?: string
}

interface MessagesResponse {
  content: ContentBlock[]
  stop_reason: string
  stop_details?: { category?: string | null; explanation?: string } | null
  error?: { message?: string }
}

function headers(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'server-side-fallback-2026-07-01',
  }
}

function threadTranscript(request: AiRequest): string {
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
  if (transcript.length <= MAX_THREAD_CHARS) return transcript
  // Keep the newest messages intact when the thread is huge; the beginning is the least useful part.
  return `[earlier messages trimmed]\n${transcript.slice(-MAX_THREAD_CHARS)}`
}

function systemPrompt(request: AiRequest): string {
  const me = request.me ? `The user is ${request.me}.` : ''
  switch (request.kind) {
    case 'summarize':
      return `You are the assistant inside an email client. ${me} Summarize the conversation in at most four short bullet points, then one line starting with "Next:" saying what, if anything, the user needs to do. Plain text only, no headings.`
    case 'draft':
      return `You are the assistant inside an email client. ${me} Write the reply the user would send, in their voice: direct, warm, short. Output only the email body, no subject line, no quoted text, no sign-off placeholder like [Name]. ${request.instruction ? `Follow this instruction from the user: ${request.instruction}` : 'Reply to the latest message.'}`
    case 'ask':
      return `You are the assistant inside an email client. ${me} Answer the user's question about this conversation briefly and concretely. Plain text only.`
    case 'triage':
      return 'You sort email.'
  }
}

export class Claude {
  constructor(private readonly store: Store) {}

  private key(): string {
    const key = this.store.settings.anthropicApiKey
    if (!key) throw new Error('Add an Anthropic API key in Settings to use the assistant.')
    return key
  }

  private model(): string {
    return this.store.settings.aiModel || 'claude-opus-5-5'
  }

  async complete(request: AiRequest): Promise<string> {
    const user = request.kind === 'ask' ? `${threadTranscript(request)}\n\nQuestion: ${request.instruction ?? ''}` : threadTranscript(request)
    const response = await fetch(API, {
      method: 'POST',
      headers: headers(this.key()),
      body: JSON.stringify({
        model: this.model(),
        max_tokens: 16000,
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: systemPrompt(request),
        messages: [{ role: 'user', content: user }],
      }),
    })
    const json = (await response.json()) as MessagesResponse
    if (!response.ok) throw new Error(`Claude: ${json.error?.message ?? response.status}`)
    if (json.stop_reason === 'refusal') throw new Error(`Claude declined: ${json.stop_details?.explanation ?? json.stop_details?.category ?? 'refusal'}`)
    return json.content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
  }

  async stream(request: AiRequest, onChunk: (text: string) => void): Promise<string> {
    const response = await fetch(API, {
      method: 'POST',
      headers: headers(this.key()),
      body: JSON.stringify({
        model: this.model(),
        max_tokens: 64000,
        stream: true,
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: systemPrompt(request),
        messages: [{ role: 'user', content: threadTranscript(request) }],
      }),
    })
    if (!response.ok || !response.body) {
      const json = (await response.json().catch(() => ({}))) as MessagesResponse
      throw new Error(`Claude: ${json.error?.message ?? response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let refusal: string | null = null
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const dataLine = event.split('\n').find((line) => line.startsWith('data: '))
        if (!dataLine) continue
        const data = JSON.parse(dataLine.slice(6)) as {
          type: string
          delta?: { type?: string; text?: string; stop_reason?: string }
          error?: { message?: string }
        }
        if (data.type === 'error') throw new Error(`Claude: ${data.error?.message ?? 'stream error'}`)
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
          full += data.delta.text
          onChunk(data.delta.text)
        }
        if (data.type === 'message_delta' && data.delta?.stop_reason === 'refusal') refusal = 'Claude declined this request.'
      }
    }
    if (refusal) throw new Error(refusal)
    return full
  }

  async triage(threads: ThreadSummary[], me: string): Promise<TriageResult[]> {
    if (!threads.length) return []
    const listing = threads
      .map((thread) => `${thread.id} | from: ${thread.participants.map((address) => `${address.name} <${address.email}>`).join(', ')} | subject: ${thread.subject} | ${thread.snippet.slice(0, 160)}`)
      .join('\n')
    const response = await fetch(API, {
      method: 'POST',
      headers: headers(this.key()),
      body: JSON.stringify({
        model: this.model(),
        max_tokens: 16000,
        fallbacks: 'default',
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['results'],
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['threadId', 'split', 'reason'],
                    properties: {
                      threadId: { type: 'string' },
                      split: { type: 'string', enum: ['important', 'other'] },
                      reason: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        system: `You sort the inbox of ${me}. "important" means a real person wrote to them and may expect a reply, or something time-sensitive they personally need. "other" means newsletters, notifications, receipts, promotions, automated updates, or mass mail. Give a reason of at most eight words.`,
        messages: [{ role: 'user', content: listing }],
      }),
    })
    const json = (await response.json()) as MessagesResponse
    if (!response.ok) throw new Error(`Claude: ${json.error?.message ?? response.status}`)
    if (json.stop_reason === 'refusal') return []
    const text = json.content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
    const parsed = JSON.parse(text) as { results: TriageResult[] }
    return parsed.results
  }
}
