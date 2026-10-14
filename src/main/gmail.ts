import type { GoogleAuth } from './google-auth'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface GmailInit {
  method?: string
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}

export class Gmail {
  constructor(private readonly auth: GoogleAuth) {}

  async request<T>(path: string, init: GmailInit = {}): Promise<T> {
    const url = new URL(`${BASE}/${path.replace(/^\//, '')}`)
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value === undefined) continue
      if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry))
      else url.searchParams.set(key, value)
    }
    const attempt = async (retryOnAuth: boolean): Promise<T> => {
      const token = await this.auth.accessToken()
      const response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
      if (response.status === 401 && retryOnAuth) {
        return attempt(false)
      }
      if (response.status === 204) return undefined as T
      const text = await response.text()
      if (!response.ok) {
        let message = `${response.status}`
        try {
          const json = JSON.parse(text) as { error?: { message?: string } }
          message = json.error?.message ?? message
        } catch {
          message = text || message
        }
        throw new Error(`Gmail: ${message}`)
      }
      return text ? (JSON.parse(text) as T) : (undefined as T)
    }
    return attempt(true)
  }
}
