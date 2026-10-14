import { useEffect, useMemo, useRef, useState } from 'react'
import { messageText } from '@shared/gmail-parse'
import type { FullMessage, Thread } from '@shared/types'
import { avatarColor, initials, whenLong } from '../lib/format'

interface Props {
  thread: Thread | null
  loading: boolean
  me: string
  summary: { text: string; loading: boolean } | null
  onDismissSummary: () => void
}

const FRAME_STYLE = `<style>
  html,body{margin:0;padding:0;background:transparent;color:#e9e9ec;font-family:-apple-system,BlinkMacSystemFont,'Inter','Helvetica Neue',Arial,sans-serif;font-size:13.5px;line-height:1.55}
  body{overflow-x:hidden;word-wrap:break-word}
  a{color:#8fa6ff}
  img{max-width:100%;height:auto}
  blockquote{border-left:2px solid #33363d;margin:8px 0;padding-left:12px;color:#a4a7b0}
  table{max-width:100%}
  *{scrollbar-width:thin}
</style>`

function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const doc = useMemo(() => {
    // Remote images are blocked by the frame CSP; links open in the system browser via the main process.
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src 'none'">`
    const base = `<base target="_blank">`
    return `<!doctype html><html><head><meta charset="utf-8">${csp}${base}${FRAME_STYLE}</head><body>${html}</body></html>`
  }, [html])

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const measure = () => {
      const body = frame.contentDocument?.body
      if (body) setHeight(Math.min(Math.max(body.scrollHeight + 8, 40), 20000))
    }
    frame.addEventListener('load', () => {
      measure()
      frame.contentDocument?.addEventListener('click', (event) => {
        const anchor = (event.target as HTMLElement | null)?.closest('a')
        if (anchor?.href) {
          event.preventDefault()
          void window.duper.shell.openExternal(anchor.href)
        }
      })
      const observer = new ResizeObserver(measure)
      if (frame.contentDocument?.body) observer.observe(frame.contentDocument.body)
    })
  }, [doc])

  return <iframe ref={ref} sandbox="allow-same-origin" srcDoc={doc} style={{ height }} title="message" />
}

function Message({ message, expanded, onToggle, me }: { message: FullMessage; expanded: boolean; onToggle: () => void; me: string }) {
  const isMe = message.from.email === me
  const toLabel = message.to.map((address) => (address.email === me ? 'me' : address.name)).join(', ')
  return (
    <div className={`message${expanded ? '' : ' collapsed'}`} onClick={expanded ? undefined : onToggle}>
      <div className="message-head">
        <span className="avatar" style={{ background: avatarColor(message.from.email) }}>{initials(message.from)}</span>
        <div>
          <span className="name">
            {isMe ? 'Me' : message.from.name}
            {expanded && !isMe && <span className="addr">{message.from.email}</span>}
          </span>
          {expanded && <div className="to">to {toLabel || 'me'}</div>}
        </div>
        <span className="when">{whenLong(message.date)}</span>
      </div>
      {expanded ? (
        <>
          <div className="message-body">{message.body.html ? <HtmlBody html={message.body.html} /> : <pre>{message.body.text ?? message.snippet}</pre>}</div>
          {message.body.attachments.length > 0 && (
            <div className="attachments">
              {message.body.attachments.map((attachment) => (
                <span className="attachment" key={attachment.attachmentId}>
                  {attachment.filename} · {Math.max(1, Math.round(attachment.size / 1024))} KB
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="preview">{messageText(message).slice(0, 140)}</div>
      )}
    </div>
  )
}

export function ThreadView({ thread, loading, me, summary, onDismissSummary }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!thread) return
    // Open the latest message and any unread ones, like Superhuman; older ones stay collapsed.
    const open = new Set<string>()
    thread.messages.forEach((message, index) => {
      if (message.unread || index === thread.messages.length - 1) open.add(message.id)
    })
    setExpanded(open)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [thread?.id])

  if (!thread) {
    return (
      <div className="pane">
        <div className="empty">
          {loading ? <span className="spinner" /> : (
            <>
              <div className="big">DuperHuman</div>
              <div>Select a conversation, or press <kbd>?</kbd> for shortcuts.</div>
            </>
          )}
        </div>
      </div>
    )
  }

  const labels = thread.labelIds.filter((label) => !label.startsWith('CATEGORY_') && !['INBOX', 'UNREAD', 'IMPORTANT', 'SENT', 'STARRED'].includes(label))

  return (
    <div className="pane-scroll" ref={scrollRef}>
      <div className="thread">
        <h1>{thread.subject}</h1>
        <div className="labels">
          {thread.starred && <span className="label">★ Starred</span>}
          {labels.map((label) => (
            <span className="label" key={label}>{label.replace(/^Label_/, '').toLowerCase()}</span>
          ))}
        </div>
        {summary && (
          <div className="ai-card">
            <div className="title">
              <span>Summary</span>
              <button className="btn ghost" style={{ padding: 0 }} onClick={onDismissSummary}>esc</button>
            </div>
            <div className={`body${summary.loading ? ' muted' : ''}`}>{summary.loading ? 'Reading the conversation…' : summary.text}</div>
          </div>
        )}
        {thread.messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            me={me}
            expanded={expanded.has(message.id)}
            onToggle={() => setExpanded((previous) => new Set(previous).add(message.id))}
          />
        ))}
      </div>
    </div>
  )
}
