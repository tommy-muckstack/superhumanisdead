/**
 * Composer text formatting. The composer is a plain textarea; formatting is stored as
 * light markup and rendered to HTML when sending:
 *   **bold**  _italic_  ++underline++  ~~strike~~  [text](https://url)
 *   "- " bullets, "1. " numbered lists, "> " quotes.
 */
export interface Edit {
  text: string
  start: number
  end: number
}

/** Wrap the selection (or insert empty markers with the caret inside). Toggles off if already wrapped. */
export function wrapSelection(text: string, start: number, end: number, marker: string): Edit {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return { text: before.slice(0, -marker.length) + selected + after.slice(marker.length), start: start - marker.length, end: end - marker.length }
  }
  return { text: before + marker + selected + marker + after, start: start + marker.length, end: end + marker.length }
}

export function insertLink(text: string, start: number, end: number, url: string): Edit {
  const label = text.slice(start, end) || url
  const link = `[${label}](${url})`
  return { text: text.slice(0, start) + link + text.slice(end), start: start + link.length, end: start + link.length }
}

/** Toggle a line prefix ("- ", "1. ", "> ") on every line touched by the selection. */
export function toggleLinePrefix(text: string, start: number, end: number, kind: 'bullet' | 'number' | 'quote'): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const nextBreak = text.indexOf('\n', end)
  const lineEnd = nextBreak === -1 ? text.length : nextBreak
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const pattern = kind === 'bullet' ? /^- / : kind === 'number' ? /^\d+\. / : /^> /
  const allHave = lines.every((line) => pattern.test(line))
  const next = lines.map((line, index) => {
    if (allHave) return line.replace(pattern, '')
    const clean = line.replace(/^(- |\d+\. |> )/, '')
    return (kind === 'bullet' ? '- ' : kind === 'number' ? `${index + 1}. ` : '> ') + clean
  })
  const block = next.join('\n')
  return { text: text.slice(0, lineStart) + block + text.slice(lineEnd), start: lineStart, end: lineStart + block.length }
}

/** Continue a list on Enter: returns the edit, or null when the caret line is not a list item. */
export function continueList(text: string, caret: number): Edit | null {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1
  const line = text.slice(lineStart, caret)
  const match = /^(- |(\d+)\. |> )(.*)$/.exec(line)
  if (!match) return null
  if (!match[3]) {
    // Empty item: end the list.
    return { text: text.slice(0, lineStart) + text.slice(caret), start: lineStart, end: lineStart }
  }
  const prefix = match[2] ? `${Number(match[2]) + 1}. ` : (match[1] ?? '')
  const insert = `\n${prefix}`
  return { text: text.slice(0, caret) + insert + text.slice(caret), start: caret + insert.length, end: caret + insert.length }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
}

/** Render the composer markup to email-safe HTML. */
export function renderMarkup(text: string): string {
  const out: string[] = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? /^\d+\. / : /^- /).test(lines[i] ?? '')) {
        items.push(`<li>${inline((lines[i] ?? '').replace(/^(- |\d+\. )/, ''))}</li>`)
        i++
      }
      out.push(`<${ordered ? 'ol' : 'ul'} style="margin:0 0 0 20px;padding:0">${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    if (/^> ?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^> ?/.test(lines[i] ?? '')) {
        quoted.push((lines[i] ?? '').replace(/^> ?/, ''))
        i++
      }
      out.push(`<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">${renderMarkup(quoted.join('\n'))}</blockquote>`)
      continue
    }
    out.push(line ? `<div>${inline(line)}</div>` : '<div><br></div>')
    i++
  }
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${out.join('')}</div>`
}

/** Plain-text alternative: drop markers but keep link targets. */
export function markupToText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 <$2>')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\+\+(.+?)\+\+/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
}
