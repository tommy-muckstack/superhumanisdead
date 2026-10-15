/**
 * Pluggable LLM providers. "anthropic" uses the Messages API; "openai" covers any
 * OpenAI-compatible Chat Completions endpoint (OpenAI, xAI, OpenRouter, Ollama, LM Studio)
 * via a base URL. Pure request/response shaping so it is unit tested.
 */
export type ProviderKind = 'anthropic' | 'openai'

export interface ProviderConfig {
  kind: ProviderKind
  apiKey: string
  model: string
  baseUrl?: string
}

export interface ChatRequest {
  system: string
  user: string
  maxTokens: number
  stream: boolean
}

export interface HttpRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export const DEFAULT_MODELS: Record<ProviderKind, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5',
}

export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
}

export function buildRequest(config: ProviderConfig, chat: ChatRequest): HttpRequest {
  const base = (config.baseUrl || DEFAULT_BASE_URLS[config.kind]).replace(/\/$/, '')
  const model = config.model || DEFAULT_MODELS[config.kind]
  if (config.kind === 'anthropic') {
    return {
      url: `${base}/messages`,
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: chat.maxTokens, stream: chat.stream || undefined, system: chat.system, messages: [{ role: 'user', content: chat.user }] }),
    }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
  return {
    url: `${base}/chat/completions`,
    headers,
    body: JSON.stringify({
      model,
      max_tokens: chat.maxTokens,
      stream: chat.stream || undefined,
      messages: [
        { role: 'system', content: chat.system },
        { role: 'user', content: chat.user },
      ],
    }),
  }
}

/** Extract text from a non-streaming response body. */
export function parseResponse(kind: ProviderKind, json: unknown): string {
  const data = json as Record<string, unknown>
  if (data['error']) {
    const error = data['error'] as { message?: string } | string
    throw new Error(typeof error === 'string' ? error : (error.message ?? 'AI request failed'))
  }
  if (kind === 'anthropic') {
    if (data['stop_reason'] === 'refusal') throw new Error('The model declined this request.')
    const content = (data['content'] as { type: string; text?: string }[] | undefined) ?? []
    return content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
  }
  const choices = (data['choices'] as { message?: { content?: string } }[] | undefined) ?? []
  return choices[0]?.message?.content ?? ''
}

/**
 * Incremental SSE parser. Feed raw text chunks; get back text deltas.
 * Handles both Anthropic (content_block_delta) and OpenAI (choices[].delta.content).
 */
export class SseDecoder {
  private buffer = ''
  done = false
  constructor(private readonly kind: ProviderKind) {}

  push(chunk: string): string[] {
    this.buffer += chunk
    const out: string[] = []
    const events = this.buffer.split(/\r?\n\r?\n/)
    this.buffer = events.pop() ?? ''
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') {
          this.done = true
          continue
        }
        let data: Record<string, unknown>
        try {
          data = JSON.parse(payload) as Record<string, unknown>
        } catch {
          continue
        }
        if (data['type'] === 'error' || (this.kind === 'openai' && data['error'])) {
          const error = data['error'] as { message?: string } | undefined
          throw new Error(error?.message ?? 'stream error')
        }
        if (this.kind === 'anthropic') {
          const delta = data['delta'] as { type?: string; text?: string; stop_reason?: string } | undefined
          if (data['type'] === 'content_block_delta' && delta?.type === 'text_delta' && delta.text) out.push(delta.text)
          if (data['type'] === 'message_stop') this.done = true
        } else {
          const choices = (data['choices'] as { delta?: { content?: string }; finish_reason?: string | null }[] | undefined) ?? []
          const text = choices[0]?.delta?.content
          if (text) out.push(text)
          if (choices[0]?.finish_reason) this.done = true
        }
      }
    }
    return out
  }
}
