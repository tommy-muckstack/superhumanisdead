import { useEffect, useRef, useState } from 'react'

export interface Draft {
  mode: 'reply' | 'replyAll' | 'forward' | 'new'
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string | null
  references?: string | null
  quoted: string
}

interface Props {
  draft: Draft
  sending: boolean
  aiBusy: boolean
  onChange: (draft: Draft) => void
  onSend: () => void
  onDiscard: () => void
  onAiDraft: (instruction?: string) => void
}

export function Composer({ draft, sending, aiBusy, onChange, onSend, onDiscard, onAiDraft }: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [showCc, setShowCc] = useState(Boolean(draft.cc || draft.bcc))
  const [instruction, setInstruction] = useState('')
  const [askingAi, setAskingAi] = useState(false)

  useEffect(() => {
    const target = draft.mode === 'new' || draft.mode === 'forward' ? null : bodyRef.current
    ;(target ?? document.querySelector<HTMLInputElement>('.composer input')) ?.focus()
  }, [])

  const update = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...draft, [key]: event.target.value })

  const onKey = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      onSend()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onDiscard()
    } else if (event.key === 'k' && event.metaKey) {
      // Let the global palette binding handle it.
      return
    } else if (event.key === 'j' && event.metaKey) {
      event.preventDefault()
      setAskingAi(true)
    }
  }

  const title = { reply: 'Reply', replyAll: 'Reply all', forward: 'Forward', new: 'New message' }[draft.mode]
  const canSend = draft.to.trim().length > 0 && !sending

  return (
    <div className="composer" onKeyDown={onKey}>
      <div className="fields">
        <label>{title} to</label>
        <input value={draft.to} onChange={update('to')} placeholder="name@example.com, …" spellCheck={false} />
        {showCc ? (
          <>
            <label>Cc</label>
            <input value={draft.cc} onChange={update('cc')} spellCheck={false} />
            <label>Bcc</label>
            <input value={draft.bcc} onChange={update('bcc')} spellCheck={false} />
          </>
        ) : null}
        <label>Subject</label>
        <input value={draft.subject} onChange={update('subject')} />
      </div>
      <textarea ref={bodyRef} value={draft.body} onChange={update('body')} placeholder={aiBusy ? 'Writing…' : 'Write your message'} />
      {askingAi && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input
            autoFocus
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Tell the assistant what to say (optional), then press Enter"
            style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--line-strong)', borderRadius: 6, padding: '6px 8px', outline: 'none' }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                setAskingAi(false)
                onAiDraft(instruction.trim() || undefined)
                setInstruction('')
              }
              if (event.key === 'Escape') setAskingAi(false)
            }}
          />
        </div>
      )}
      <div className="bar">
        <button className="btn primary" disabled={!canSend} onClick={onSend}>
          {sending ? 'Sending…' : 'Send'} <kbd style={{ marginLeft: 6, color: '#fff', background: 'rgba(255,255,255,.15)', borderColor: 'transparent' }}>⌘↵</kbd>
        </button>
        <button className="btn ghost" onClick={() => setAskingAi(true)} disabled={aiBusy}>
          {aiBusy ? <><span className="spinner" /> Writing</> : <>Write with AI <kbd>⌘J</kbd></>}
        </button>
        {!showCc && <button className="btn ghost" onClick={() => setShowCc(true)}>Cc/Bcc</button>}
        <span className="spacer" />
        <span>Discard <kbd>esc</kbd></span>
      </div>
    </div>
  )
}
