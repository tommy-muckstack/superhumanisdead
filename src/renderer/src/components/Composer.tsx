import { useEffect, useMemo, useRef, useState } from 'react'
import { composeCommand, type Command } from '@shared/keys'
import { fuzzyFilter } from '@shared/fuzzy'
import { expandSnippet, inlineTrigger, missingVariables, type Snippet, type SnippetContext } from '@shared/snippets'
import { firstRecipient, insertAt, replaceTrigger } from '@shared/compose'
import { REWRITES, type RewriteStyle } from '@shared/ai-prompts'
import { continueList, insertLink, toggleLinePrefix, wrapSelection, type Edit } from '@shared/format'
import { emojiMatches, emojiTrigger } from '@shared/emoji'
import { instantIntro } from '@shared/intro'
import type { OutgoingAttachment } from '@shared/types'
import type { SendAs } from '../lib/gmail'
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
  from?: string
  attachments?: OutgoingAttachment[]
  /** Floating (popped-out) composer instead of docked under the thread. */
  popped?: boolean
}

export type SendMode = 'normal' | 'now' | 'done'

interface Props {
  draft: Draft
  sending: boolean
  aiBusy: boolean
  snippets: Snippet[]
  me: { name: string; email: string }
  aliases: SendAs[]
  weekdaysOnly?: boolean
  onChange: (draft: Draft) => void
  onSend: (mode: SendMode) => void
  onDiscard: () => void
  onAiDraft: (instruction?: string) => void
  onRewrite: (style: RewriteStyle) => void
  onSnippetUsed: (snippet: Snippet) => void
  onManageSnippets: () => void
  onPopToggle: () => void
  onBlurToThread: () => void
}

const REWRITE_LABELS: Record<RewriteStyle, string> = { improve: 'Improve writing', shorten: 'Shorten', lengthen: 'Lengthen', simplify: 'Simplify', voice: 'In my voice' }
const MAX_BYTES = 25 * 1024 * 1024

function readFile(file: File): Promise<OutgoingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.onload = () => resolve({ filename: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, data: String(reader.result).split(',')[1] ?? '' })
    reader.readAsDataURL(file)
  })
}

export function Composer(props: Props) {
  const { draft, sending, aiBusy, onChange } = props
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const ccRef = useRef<HTMLInputElement>(null)
  const bccRef = useRef<HTMLInputElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const fromRef = useRef<HTMLSelectElement>(null)
  const [showCc, setShowCc] = useState(Boolean(draft.cc || draft.bcc))
  const [instruction, setInstruction] = useState('')
  const [askingAi, setAskingAi] = useState(false)
  const [picker, setPicker] = useState<'snippets' | 'sendLater' | 'remind' | null>(null)
  const [trigger, setTrigger] = useState<{ query: string; start: number } | null>(null)
  const [emoji, setEmoji] = useState<{ query: string; start: number } | null>(null)
  const [triggerIndex, setTriggerIndex] = useState(0)
  const [linkInput, setLinkInput] = useState<{ start: number; end: number } | null>(null)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const caretAfter = useRef<{ start: number; end: number } | null>(null)

  const say = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice(''), 3500)
  }

  useEffect(() => {
    const target = draft.mode === 'new' || draft.mode === 'forward' ? toRef.current : bodyRef.current
    target?.focus()
  }, [])

  useEffect(() => {
    if (caretAfter.current && bodyRef.current) {
      bodyRef.current.focus()
      bodyRef.current.setSelectionRange(caretAfter.current.start, caretAfter.current.end)
      caretAfter.current = null
    }
  }, [draft.body])

  const context: SnippetContext = useMemo(() => ({ to: firstRecipient(draft.to), me: props.me }), [draft.to, props.me])
  const inlineMatches = useMemo(() => (trigger ? fuzzyFilter(trigger.query, props.snippets, (snippet) => snippet.name, 6) : []), [trigger, props.snippets])
  const emojis = useMemo(() => (emoji ? emojiMatches(emoji.query) : []), [emoji])

  const applyEdit = (edit: Edit) => {
    caretAfter.current = { start: edit.start, end: edit.end }
    onChange({ ...draft, body: edit.text })
  }

  const selection = () => ({ start: bodyRef.current?.selectionStart ?? draft.body.length, end: bodyRef.current?.selectionEnd ?? draft.body.length })

  const applySnippet = (snippet: Snippet, mode: 'trigger' | 'caret') => {
    const text = expandSnippet(snippet.body, context)
    const caret = bodyRef.current?.selectionStart ?? draft.body.length
    const result = mode === 'trigger' && trigger ? replaceTrigger(draft.body, trigger.start, caret, text) : insertAt(draft.body, caret, text)
    caretAfter.current = { start: result.caret, end: result.caret }
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
    if (missing.length) say(`Fill in: ${missing.map((name) => `{${name}}`).join(' ')}`)
  }

  const applyEmoji = (char: string) => {
    if (!emoji) return
    const caret = bodyRef.current?.selectionStart ?? draft.body.length
    const result = replaceTrigger(draft.body, emoji.start, caret, char)
    caretAfter.current = { start: result.caret, end: result.caret }
    onChange({ ...draft, body: result.text })
    setEmoji(null)
  }

  const update = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...draft, [key]: event.target.value })

  const onBodyChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...draft, body: event.target.value })
    const caret = event.target.selectionStart
    setTrigger(inlineTrigger(event.target.value, caret))
    setEmoji(emojiTrigger(event.target.value, caret))
    setTriggerIndex(0)
  }

  const menuOpen = (trigger && inlineMatches.length > 0) || (emoji && emojis.length > 0)
  const menuSize = trigger && inlineMatches.length ? inlineMatches.length : emojis.length

  const onBodyKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setTriggerIndex((index) => Math.min(index + 1, menuSize - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setTriggerIndex((index) => Math.max(index - 1, 0))
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        if (trigger && inlineMatches.length) {
          const snippet = inlineMatches[triggerIndex]
          if (snippet) applySnippet(snippet, 'trigger')
        } else {
          const pick = emojis[triggerIndex]
          if (pick) applyEmoji(pick.char)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setTrigger(null)
        setEmoji(null)
        return
      }
    }
    if (event.key === 'Enter' && !event.metaKey && !event.shiftKey) {
      const edit = continueList(draft.body, event.currentTarget.selectionStart)
      if (edit && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
        event.preventDefault()
        applyEdit(edit)
      }
    }
  }

  const attach = async (files: File[] | OutgoingAttachment[]) => {
    const incoming = await Promise.all((files as (File | OutgoingAttachment)[]).map((file) => ('data' in file ? Promise.resolve(file) : readFile(file))))
    const all = [...(draft.attachments ?? []), ...incoming]
    if (all.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) return say('Gmail limits a message to 25 MB of attachments.')
    onChange({ ...draft, attachments: all })
  }

  const pickFiles = () => {
    void window.duper.files
      .pick()
      .then((files) => {
        if (files.length) return attach(files)
      })
      .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)))
  }

  const runCommand = (command: Command): boolean => {
    const { start, end } = selection()
    switch (command) {
      case 'send': props.onSend('normal'); return true
      case 'sendNow': props.onSend('now'); return true
      case 'sendDone': props.onSend('done'); return true
      case 'sendLater': setPicker('sendLater'); return true
      case 'remindCompose': setPicker('remind'); return true
      case 'useSnippet': setPicker('snippets'); return true
      case 'writeAi': setAskingAi(true); return true
      case 'discard': props.onDiscard(); return true
      case 'focusTo': toRef.current?.focus(); return true
      case 'focusCc':
      case 'focusBcc':
        setShowCc(true)
        setTimeout(() => (command === 'focusCc' ? ccRef : bccRef).current?.focus())
        return true
      case 'focusSubject': subjectRef.current?.focus(); return true
      case 'focusBody': bodyRef.current?.focus(); return true
      case 'focusFrom':
        if (props.aliases.length > 1) fromRef.current?.focus()
        else say('No other send-as addresses on this account')
        return true
      case 'attach': pickFiles(); return true
      case 'popToggle': props.onPopToggle(); return true
      case 'focusToggle': props.onBlurToThread(); return true
      case 'bold': applyEdit(wrapSelection(draft.body, start, end, '**')); return true
      case 'italic': applyEdit(wrapSelection(draft.body, start, end, '_')); return true
      case 'underline': applyEdit(wrapSelection(draft.body, start, end, '++')); return true
      case 'strike': applyEdit(wrapSelection(draft.body, start, end, '~~')); return true
      case 'bullets': applyEdit(toggleLinePrefix(draft.body, start, end, 'bullet')); return true
      case 'numbered': applyEdit(toggleLinePrefix(draft.body, start, end, 'number')); return true
      case 'quote': applyEdit(toggleLinePrefix(draft.body, start, end, 'quote')); return true
      case 'link':
        if (start === end) return false // no selection: let ⌘K open the palette
        setLinkInput({ start, end })
        return true
      case 'instantIntro': {
        const introducer = firstRecipient(draft.to)
        if (!introducer.email) return say('Reply to the introduction first'), true
        const next = instantIntro(draft, introducer)
        if (!next.to) return say('Reply all (A) first so the others are on the message'), true
        onChange({ ...draft, ...next })
        setShowCc(true)
        say(`Moved ${introducer.email} to Bcc`)
        return true
      }
      default:
        return false
    }
  }

  const onKey = (event: React.KeyboardEvent) => {
    const command = composeCommand(event)
    if (command && runCommand(command)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // Plain typing stays in the composer; unhandled ⌘ chords (⌘K, ⌘R…) reach the app.
    if (!event.metaKey && !event.ctrlKey) event.stopPropagation()
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

  const showFrom = props.aliases.length > 1

  return (
    <div
      className={`composer${draft.popped ? ' popped' : ''}${dragging ? ' dragging' : ''}`}
      onKeyDown={onKey}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const files = [...event.dataTransfer.files]
        if (files.length) void attach(files)
      }}
    >
      {draft.popped && <div className="pop-head"><span>{title}</span><button className="close" onClick={props.onPopToggle} title="Pop in (⌘⇧P)">⇲</button></div>}
      <div className="fields">
        {showFrom && (
          <>
            <label>From</label>
            <select ref={fromRef} value={draft.from ?? props.me.email} onChange={(event) => onChange({ ...draft, from: event.target.value })}>
              {props.aliases.map((alias) => (
                <option key={alias.email} value={alias.email}>{alias.name ? `${alias.name} <${alias.email}>` : alias.email}</option>
              ))}
            </select>
          </>
        )}
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
          onBlur={() => setTimeout(() => { setTrigger(null); setEmoji(null) }, 150)}
          placeholder={aiBusy ? 'Writing…' : 'Tip: ⌘J for AI, ; for snippets, :smile for emoji'}
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
        {!trigger && emoji && emojis.length > 0 && (
          <div className="inline-snippets">
            {emojis.map((entry, index) => (
              <div key={entry.code} className={`item${index === triggerIndex ? ' active' : ''}`} onMouseDown={(event) => { event.preventDefault(); applyEmoji(entry.char) }}>
                <span>{entry.char}</span>
                <span className="hint">:{entry.code}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {linkInput && (
        <div className="ai-prompt link-input">
          <input
            autoFocus
            placeholder="Paste a link and press Enter"
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                const url = (event.target as HTMLInputElement).value.trim()
                const full = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`
                if (url) applyEdit(insertLink(draft.body, linkInput.start, linkInput.end, full))
                setLinkInput(null)
              }
              if (event.key === 'Escape') {
                setLinkInput(null)
                bodyRef.current?.focus()
              }
            }}
          />
        </div>
      )}
      {(draft.attachments?.length ?? 0) > 0 && (
        <div className="attach-list">
          {draft.attachments?.map((file, index) => (
            <span key={`${file.filename}-${index}`} className="attachment">
              📎 {file.filename} · {Math.max(1, Math.round(file.size / 1024))} KB
              <button onClick={() => onChange({ ...draft, attachments: draft.attachments?.filter((_, i) => i !== index) })} aria-label={`Remove ${file.filename}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="fmt-bar" role="toolbar" aria-label="Formatting">
        {([['bold', 'B', 'meta+b'], ['italic', 'I', 'meta+i'], ['underline', 'U', 'meta+u'], ['strike', 'S', 'meta+shift+x'], ['link', '🔗', 'meta+k'], ['bullets', '•', 'meta+shift+8'], ['numbered', '1.', 'meta+shift+7'], ['quote', '❝', 'meta+shift+9']] as const).map(([command, label, keys]) => (
          <button key={command} className={`fmt fmt-${command}`} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(command)} title={keys}>{label}</button>
        ))}
        <button className="fmt" onClick={pickFiles} title="Attach (⌘⇧A)">📎</button>
        <button className="fmt" onClick={() => runCommand('instantIntro')} title="Instant Intro (⌘⇧I)">Intro</button>
        {!draft.popped && <button className="fmt" onClick={props.onPopToggle} title="Pop out (⌘⇧P)">⇱</button>}
        {notice && <span className="notice">{notice}</span>}
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
