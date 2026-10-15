import { useEffect, useMemo, useRef, useState } from 'react'
import { composeCommand } from '@shared/keys'
import { fuzzyFilter } from '@shared/fuzzy'
import { expandSnippet, inlineTrigger, missingVariables, type Snippet, type SnippetContext } from '@shared/snippets'
import { firstRecipient, insertAt, replaceTrigger } from '@shared/compose'
import { REWRITES, type RewriteStyle } from '@shared/ai-prompts'
import { whenSnooze } from '../lib/format'
import { Keys, SnippetPicker, TimePicker, type TimeChoice } from './Overlays'

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
  /** Send later time. */
  sendAt?: number
  /** Bring the thread back at this time if nobody replies. */
  remindAt?: number
}

export type SendMode = 'normal' | 'now' | 'done'

interface Props {
  draft: Draft
  sending: boolean
  aiBusy: boolean
  snippets: Snippet[]
  me: { name: string; email: string }
  weekdaysOnly?: boolean
  onChange: (draft: Draft) => void
  onSend: (mode: SendMode) => void
  onDiscard: () => void
  onAiDraft: (instruction?: string) => void
  onRewrite: (style: RewriteStyle) => void
  onSnippetUsed: (snippet: Snippet) => void
  onManageSnippets: () => void
}

const REWRITE_LABELS: Record<RewriteStyle, string> = { improve: 'Improve writing', shorten: 'Shorten', lengthen: 'Lengthen', simplify: 'Simplify', voice: 'In my voice' }

export function Composer(props: Props) {
  const { draft, sending, aiBusy, onChange } = props
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const ccRef = useRef<HTMLInputElement>(null)
  const bccRef = useRef<HTMLInputElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const [showCc, setShowCc] = useState(Boolean(draft.cc || draft.bcc))
  const [instruction, setInstruction] = useState('')
  const [askingAi, setAskingAi] = useState(false)
  const [picker, setPicker] = useState<'snippets' | 'sendLater' | 'remind' | null>(null)
  const [trigger, setTrigger] = useState<{ query: string; start: number } | null>(null)
  const [triggerIndex, setTriggerIndex] = useState(0)
  const caretAfter = useRef<number | null>(null)

  useEffect(() => {
    const target = draft.mode === 'new' || draft.mode === 'forward' ? toRef.current : bodyRef.current
    target?.focus()
  }, [])

  useEffect(() => {
    if (caretAfter.current !== null && bodyRef.current) {
      bodyRef.current.focus()
      bodyRef.current.setSelectionRange(caretAfter.current, caretAfter.current)
      caretAfter.current = null
    }
  }, [draft.body])

  const context: SnippetContext = useMemo(() => ({ to: firstRecipient(draft.to), me: props.me }), [draft.to, props.me])
  const inlineMatches = useMemo(() => (trigger ? fuzzyFilter(trigger.query, props.snippets, (snippet) => snippet.name, 6) : []), [trigger, props.snippets])

  const applySnippet = (snippet: Snippet, mode: 'trigger' | 'caret') => {
    const text = expandSnippet(snippet.body, context)
    const caret = bodyRef.current?.selectionStart ?? draft.body.length
    const result = mode === 'trigger' && trigger ? replaceTrigger(draft.body, trigger.start, caret, text) : insertAt(draft.body, caret, text)
    caretAfter.current = result.caret
    onChange({
      ...draft,
      body: result.text,
      subject: draft.subject || (snippet.subject ? expandSnippet(snippet.subject, context) : ''),
      cc: snippet.cc ? [draft.cc, snippet.cc].filter(Boolean).join(', ') : draft.cc,
      bcc: snippet.bcc ? [draft.bcc, snippet.bcc].filter(Boolean).join(', ') : draft.bcc,
    })
    if (snippet.cc || snippet.bcc) setShowCc(true)
    setTrigger(null)
    setPicker(null)
    props.onSnippetUsed(snippet)
    const missing = missingVariables(snippet.body, context)
    if (missing.length) console.info('[snippets] unfilled variables', missing)
  }

  const update = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...draft, [key]: event.target.value })

  const onBodyChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...draft, body: event.target.value })
    setTrigger(inlineTrigger(event.target.value, event.target.selectionStart))
    setTriggerIndex(0)
  }

  const onBodyKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger || !inlineMatches.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setTriggerIndex((index) => Math.min(index + 1, inlineMatches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setTriggerIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const snippet = inlineMatches[triggerIndex]
      if (snippet && !event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        applySnippet(snippet, 'trigger')
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setTrigger(null)
    }
  }

  const onKey = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.defaultPrevented) return
    const command = composeCommand(event)
    switch (command) {
      case 'send':
        event.preventDefault()
        props.onSend('normal')
        return
      case 'sendNow':
        event.preventDefault()
        props.onSend('now')
        return
      case 'sendDone':
        event.preventDefault()
        props.onSend('done')
        return
      case 'sendLater':
        event.preventDefault()
        setPicker('sendLater')
        return
      case 'remindCompose':
        event.preventDefault()
        setPicker('remind')
        return
      case 'useSnippet':
        event.preventDefault()
        setPicker('snippets')
        return
      case 'writeAi':
        event.preventDefault()
        setAskingAi(true)
        return
      case 'discard':
        event.preventDefault()
        props.onDiscard()
        return
      case 'focusTo':
        event.preventDefault()
        toRef.current?.focus()
        return
      case 'focusCc':
      case 'focusBcc':
        event.preventDefault()
        setShowCc(true)
        setTimeout(() => (command === 'focusCc' ? ccRef : bccRef).current?.focus())
        return
      case 'focusSubject':
        event.preventDefault()
        subjectRef.current?.focus()
        return
      case 'focusBody':
        event.preventDefault()
        bodyRef.current?.focus()
        return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onDiscard()
    }
  }

  const title = { reply: 'Reply', replyAll: 'Reply all', forward: 'Forward', new: 'New message' }[draft.mode]
  const canSend = draft.to.trim().length > 0 && !sending

  const pickTime = (choice: TimeChoice) => {
    if (picker === 'sendLater') onChange({ ...draft, sendAt: choice.at.getTime() })
    else onChange({ ...draft, remindAt: choice.at.getTime() })
    setPicker(null)
    bodyRef.current?.focus()
  }

  return (
    <div className="composer" onKeyDown={onKey}>
      <div className="fields">
        <label>{title} to</label>
        <input ref={toRef} value={draft.to} onChange={update('to')} placeholder="name@example.com, …" spellCheck={false} />
        {showCc ? (
          <>
            <label>Cc</label>
            <input ref={ccRef} value={draft.cc} onChange={update('cc')} spellCheck={false} />
            <label>Bcc</label>
            <input ref={bccRef} value={draft.bcc} onChange={update('bcc')} spellCheck={false} />
          </>
        ) : null}
        <label>Subject</label>
        <input ref={subjectRef} value={draft.subject} onChange={update('subject')} />
      </div>
      <div className="body-wrap">
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={onBodyChange}
          onKeyDown={onBodyKey}
          onBlur={() => setTimeout(() => setTrigger(null), 150)}
          placeholder={aiBusy ? 'Writing…' : 'Tip: hit ⌘J for AI, ; for snippets'}
        />
        {trigger && inlineMatches.length > 0 && (
          <div className="inline-snippets">
            {inlineMatches.map((snippet, index) => (
              <div key={snippet.id} className={`item${index === triggerIndex ? ' active' : ''}`} onMouseDown={(event) => { event.preventDefault(); applySnippet(snippet, 'trigger') }}>
                <span>{snippet.name}</span>
                <span className="hint">{snippet.body.replace(/\s+/g, ' ').slice(0, 60)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {draft.body.trim().length > 0 && !aiBusy && (
        <div className="chips">
          {(Object.keys(REWRITES) as RewriteStyle[]).map((style) => (
            <button key={style} className="chip" onClick={() => props.onRewrite(style)}>
              {REWRITE_LABELS[style]}
            </button>
          ))}
        </div>
      )}
      {askingAi && (
        <div className="ai-prompt">
          <input
            autoFocus
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={draft.mode === 'new' ? 'Write, find, schedule, or ask anything' : 'Tell the assistant what to say (optional), then press Enter'}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                setAskingAi(false)
                props.onAiDraft(instruction.trim() || undefined)
                setInstruction('')
              }
              if (event.key === 'Escape') setAskingAi(false)
            }}
          />
        </div>
      )}
      <div className="bar">
        <button className="btn primary" disabled={!canSend} onClick={() => props.onSend('normal')}>
          {sending ? 'Sending…' : draft.sendAt ? 'Schedule' : 'Send'} <Keys keys="meta+Enter" />
        </button>
        <button className="btn ghost" onClick={() => setPicker('sendLater')} title="Send later">
          {draft.sendAt ? `Sends ${whenSnooze(draft.sendAt)}` : 'Send later'} <Keys keys="meta+shift+l" />
        </button>
        {draft.sendAt && <button className="btn ghost" onClick={() => onChange({ ...draft, sendAt: undefined })}>×</button>}
        <button className="btn ghost" onClick={() => setPicker('remind')} title="Remind me if no reply">
          {draft.remindAt ? `Remind ${whenSnooze(draft.remindAt)} if no reply` : 'Remind'} <Keys keys="meta+shift+h" />
        </button>
        {draft.remindAt && <button className="btn ghost" onClick={() => onChange({ ...draft, remindAt: undefined })}>×</button>}
        <button className="btn ghost" onClick={() => setPicker('snippets')}>Snippets <Keys keys="meta+;" /></button>
        <button className="btn ghost" onClick={() => setAskingAi(true)} disabled={aiBusy}>
          {aiBusy ? <><span className="spinner" /> Writing</> : <>AI <Keys keys="meta+j" /></>}
        </button>
        {!showCc && <button className="btn ghost" onClick={() => setShowCc(true)}>Cc/Bcc</button>}
        <span className="spacer" />
        <span>Discard <Keys keys="meta+shift+," /></span>
      </div>
      {picker === 'snippets' && (
        <SnippetPicker snippets={props.snippets} context={context} onPick={(snippet) => applySnippet(snippet, 'caret')} onClose={() => setPicker(null)} onManage={() => { setPicker(null); props.onManageSnippets() }} />
      )}
      {(picker === 'sendLater' || picker === 'remind') && (
        <TimePicker kind={picker === 'sendLater' ? 'sendLater' : 'remindCompose'} weekdaysOnly={props.weekdaysOnly} onPick={pickTime} onClose={() => setPicker(null)} />
      )}
    </div>
  )
}
