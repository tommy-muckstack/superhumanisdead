/** Parse List-Unsubscribe (RFC 2369) and one-click (RFC 8058) headers. */
export interface Unsubscribe {
  url?: string
  mailto?: { to: string; subject: string; body: string }
  oneClick: boolean
}

export function parseUnsubscribe(header: string | null | undefined, post?: string | null): Unsubscribe | null {
  if (!header) return null
  const targets = [...header.matchAll(/<([^>]+)>/g)].map((match) => (match[1] ?? '').trim())
  const result: Unsubscribe = { oneClick: false }
  for (const target of targets) {
    if (/^https:\/\//i.test(target) && !result.url) result.url = target
    else if (/^mailto:/i.test(target) && !result.mailto) {
      const [address, query = ''] = target.slice(7).split('?')
      const params = new URLSearchParams(query)
      result.mailto = { to: decodeURIComponent(address ?? ''), subject: params.get('subject') ?? 'unsubscribe', body: params.get('body') ?? 'unsubscribe' }
    }
  }
  if (!result.url && !result.mailto) return null
  result.oneClick = Boolean(result.url && post && /List-Unsubscribe=One-Click/i.test(post))
  return result
}
