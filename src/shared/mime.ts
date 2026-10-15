import type { Address, OutgoingMail } from './types'

export function parseAddress(raw: string): Address {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(.*?)\s*<([^>]+)>$/)
  if (match) {
    const name = (match[1] ?? '').trim().replace(/^"|"$/g, '')
    const email = (match[2] ?? '').trim().toLowerCase()
    return { name: name || email, email }
  }
  const email = trimmed.replace(/^<|>$/g, '').toLowerCase()
  return { name: email, email }
}

export function parseAddressList(raw: string | undefined): Address[] {
  if (!raw) return []
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let current = ''
  for (const char of raw) {
    if (char === '"') quoted = !quoted
    if (!quoted && char === '<') depth++
    if (!quoted && char === '>') depth--
    if (char === ',' && depth === 0 && !quoted) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current)
  return parts.filter((part) => part.trim()).map(parseAddress)
}

export function formatAddress(address: Address): string {
  if (!address.name || address.name === address.email) return address.email
  return `"${address.name.replace(/"/g, '')}" <${address.email}>`
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export function base64Url(input: string | Buffer): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeBase64Url(data: string): string {
  const normalised = data.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function wrap76(base64: string): string {
  return base64.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd()
}

export function buildRawMessage(mail: OutgoingMail, from: string): string {
  const id = () => `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const crlf = '\r\n'
  const headers: string[] = [`From: ${mail.from || from}`, `To: ${mail.to.join(', ')}`]
  if (mail.cc.length) headers.push(`Cc: ${mail.cc.join(', ')}`)
  if (mail.bcc.length) headers.push(`Bcc: ${mail.bcc.join(', ')}`)
  headers.push(`Subject: ${encodeHeader(mail.subject)}`)
  headers.push(`Date: ${new Date().toUTCString()}`)
  headers.push('MIME-Version: 1.0')
  if (mail.inReplyTo) headers.push(`In-Reply-To: ${mail.inReplyTo}`)
  if (mail.references) headers.push(`References: ${mail.references}`)

  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(mail.text, 'utf8').toString('base64'))]
  let body: { type: string; lines: string[] }
  if (mail.html) {
    const alt = id()
    body = {
      type: `multipart/alternative; boundary="${alt}"`,
      lines: [
        `--${alt}`, ...textPart,
        `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(mail.html, 'utf8').toString('base64')),
        `--${alt}--`,
      ],
    }
  } else {
    body = { type: 'text/plain; charset="UTF-8"', lines: [wrap76(Buffer.from(mail.text, 'utf8').toString('base64'))] }
  }

  const files = mail.attachments ?? []
  if (!files.length) {
    if (!mail.html) headers.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64')
    else headers.push(`Content-Type: ${body.type}`)
    return [headers.join(crlf), '', ...body.lines, ''].join(crlf)
  }
  const mixed = id()
  headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`)
  const inner = mail.html ? [`Content-Type: ${body.type}`, '', ...body.lines] : textPart
  const parts: string[] = [`--${mixed}`, ...inner]
  for (const file of files) {
    const name = encodeHeader(file.filename).replace(/"/g, '')
    parts.push(
      `--${mixed}`,
      `Content-Type: ${file.mimeType || 'application/octet-stream'}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(file.data),
    )
  }
  parts.push(`--${mixed}--`, '')
  return [headers.join(crlf), '', ...parts].join(crlf)
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escaped}</div>`
}

export function quoteForReply(text: string, from: Address, date: number): string {
  const when = new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const quoted = text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `\n\nOn ${when}, ${formatAddress(from)} wrote:\n${quoted}`
}
