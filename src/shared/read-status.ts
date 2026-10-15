/**
 * Read statuses ("Opened 4 times"). Superhuman runs a pixel host; DuperHuman can only
 * do this with a pixel server the user runs (setting `readStatusHost`). Off by default.
 * These helpers are pure so the server and client agree.
 */
export interface OpenEvent {
  token: string
  at: number
  userAgent?: string
  ip?: string
}

export interface ReadStatus {
  opens: number
  first?: number
  last?: number
  devices: { kind: 'mobile' | 'desktop' | 'unknown'; at: number }[]
}

export function newToken(random: () => number = Math.random): string {
  let token = ''
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 22; i++) token += alphabet[Math.floor(random() * alphabet.length)]
  return token
}

export function pixelUrl(host: string, token: string): string {
  return `${host.replace(/\/$/, '')}/o/${token}.gif`
}

/** Append an invisible 1x1 image just before </body> (or at the end). */
export function injectPixel(html: string, url: string): string {
  const tag = `<img src="${url}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0" />`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : `${html}${tag}`
}

export function deviceKind(userAgent = ''): 'mobile' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown'
  if (/iphone|android|mobile|ipad/i.test(userAgent)) return 'mobile'
  // Gmail and Apple Mail proxies prefetch images; treat as unknown device.
  if (/googleimageproxy|ggpht|apple mail privacy/i.test(userAgent)) return 'unknown'
  return 'desktop'
}

/**
 * Collapse raw opens: ignore opens within 60s of sending (the sender's own client
 * rendering the sent copy) and de-duplicate bursts within 30s.
 */
export function summarizeOpens(events: OpenEvent[], sentAt: number): ReadStatus {
  const sorted = events.filter((event) => event.at - sentAt > 60_000).sort((a, b) => a.at - b.at)
  const kept: OpenEvent[] = []
  for (const event of sorted) {
    const previous = kept[kept.length - 1]
    if (previous && event.at - previous.at < 30_000) continue
    kept.push(event)
  }
  return {
    opens: kept.length,
    first: kept[0]?.at,
    last: kept[kept.length - 1]?.at,
    devices: kept.map((event) => ({ kind: deviceKind(event.userAgent), at: event.at })),
  }
}

/** Human summary for the thread header and Sent rows. */
export function describeStatus(status: ReadStatus, now = Date.now()): string {
  if (!status.opens) return 'Not opened yet'
  const last = status.last ?? now
  const minutes = Math.max(0, Math.round((now - last) / 60_000))
  const ago = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`
  const device = status.devices[status.devices.length - 1]?.kind
  return `Opened ${status.opens} ${status.opens === 1 ? 'time' : 'times'} · last ${ago}${device && device !== 'unknown' ? ` on ${device}` : ''}`
}
