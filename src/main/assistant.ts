import type { Store } from './store'
import type { AiRequest, ThreadSummary, TriageResult } from '@shared/types'
import { systemPrompt, userPrompt } from '@shared/ai-prompts'
import { buildRequest, parseResponse, SseDecoder, type ProviderConfig } from '@shared/ai-provider'

/** Provider-agnostic assistant running in the main process (keys never reach the renderer). */
export class Assistant {
  constructor(private readonly store: Store) {}

  private config(): ProviderConfig {
    const s = this.store.settings
    const kind = s.aiProvider ?? 'anthropic'
    const apiKey = kind === 'anthropic' ? s.anthropicApiKey : s.openaiApiKey
    const local = kind === 'openai' && /localhost|127\.0\.0\.1/.test(s.aiBaseUrl ?? '')
    if (!apiKey && !local) throw new Error('Add an AI API key in Settings to use the assistant.')
    return { kind, apiKey: apiKey ?? '', model: s.aiModel, baseUrl: s.aiBaseUrl }
  }

  private withPersona(request: AiRequest): AiRequest {
    return { ...request, persona: request.persona ?? this.store.settings.aiPersona }
  }

  async complete(request: AiRequest, maxTokens = 8000): Promise<string> {
    const config = this.config()
    const r = this.withPersona(request)
    const http = buildRequest(config, { system: systemPrompt(r), user: userPrompt(r), maxTokens, stream: false })
    const response = await fetch(http.url, { method: 'POST', headers: http.headers, body: http.body })
    const json = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as unknown
    if (!response.ok && !(json as { error?: unknown }).error) throw new Error(`AI: HTTP ${response.status}`)
    return parseResponse(config.kind, json)
  }

  async stream(request: AiRequest, onChunk: (text: string) => void): Promise<string> {
    const config = this.config()
    const r = this.withPersona(request)
    const http = buildRequest(config, { system: systemPrompt(r), user: userPrompt(r), maxTokens: 16000, stream: true })
    const response = await fetch(http.url, { method: 'POST', headers: http.headers, body: http.body })
    if (!response.ok || !response.body) {
      const json = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as unknown
      parseResponse(config.kind, json)
      throw new Error(`AI: HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const sse = new SseDecoder(config.kind)
    let full = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      for (const text of sse.push(decoder.decode(value, { stream: true }))) {
        full += text
        onChunk(text)
      }
    }
    return full
  }

  async triage(threads: ThreadSummary[], me: string): Promise<TriageResult[]> {
    if (!threads.length) return []
    const config = this.config()
    const listing = threads
      .map((t) => `${t.id} | from: ${t.participants.map((a) => `${a.name} <${a.email}>`).join(', ')} | subject: ${t.subject} | ${t.snippet.slice(0, 160)}`)
      .join('\n')
    const system = `You sort the inbox of ${me}. "important" means a real person wrote to them and may expect a reply, or something time-sensitive they personally need. "other" means newsletters, notifications, receipts, promotions, automated updates, or mass mail. Output one line per thread: "<id> important|other <reason of at most eight words>". Nothing else.`
    const http = buildRequest(config, { system, user: listing, maxTokens: 8000, stream: false })
    const response = await fetch(http.url, { method: 'POST', headers: http.headers, body: http.body })
    const text = parseResponse(config.kind, await response.json())
    return parseTriage(text)
  }
}

export function parseTriage(text: string): TriageResult[] {
  const out: TriageResult[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*([\w-]+)\s*\|?\s*(important|other)\b\s*\|?\s*(.*)$/i.exec(line)
    if (m && m[1] && m[2]) out.push({ threadId: m[1], split: m[2].toLowerCase() as 'important' | 'other', reason: (m[3] ?? '').trim() })
  }
  return out
}
