import { useEffect, useRef, useState } from 'react'
import type { Thread, ThreadSummary } from '@shared/types'
import { Keys } from './Overlays'

export interface ChatTurn {
  role: 'user' | 'ai'
  text: string
  error?: boolean
}

interface Props {
  thread: Thread | null
  threads: ThreadSummary[]
  me: string
  onClose: () => void
  onOpenThread: (id: string) => void
  onUseAsReply: (text: string) => void
}

const SUGGESTIONS_THREAD = ['What do they need from me?', 'Summarize the decision so far', 'Draft a short yes']
const SUGGESTIONS_INBOX = ['What needs a reply today?', 'Any invoices or receipts this week?', 'Who is waiting on me?']

/** Ask AI: right-panel chat about the open conversation or the whole visible inbox. */
export function AskAi({ thread, threads, me, onClose, onOpenThread, onUseAsReply }: Props) {
  const [scope, setScope] = useState<'thread' | 'inbox'>(thread ? 'thread' : 'inbox')
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setInput('')
    setTurns((previous) => [...previous, { role: 'user', text }, { role: 'ai', text: '' }])
    setBusy(true)
    let answer = ''
    try {
      const request =
        scope === 'thread' && thread
          ? { kind: 'ask' as const, thread, me, instruction: text }
          : { kind: 'askInbox' as const, threads, me, instruction: text }
      await window.duper.ai.stream(request, (chunk) => {
        answer += chunk
        setTurns((previous) => [...previous.slice(0, -1), { role: 'ai', text: answer }])
      })
    } catch (error) {
      setTurns((previous) => [...previous.slice(0, -1), { role: 'ai', text: error instanceof Error ? error.message : String(error), error: true }])
    } finally {
      setBusy(false)
    }
  }

  /** Turn [n] citations into links to the nth listed thread. */
  const renderAnswer = (text: string) =>
    text.split(/(\[\d+\])/g).map((part, index) => {
      const match = /^\[(\d+)\]$/.exec(part)
      const target = match && scope === 'inbox' ? threads[Number(match[1]) - 1] : undefined
      return target ? (
        <button key={index} className="cite" title={target.subject} onClick={() => onOpenThread(target.id)}>
          {part}
        </button>
      ) : (
        <span key={index}>{part}</span>
      )
    })

  return (
    <aside className="side ask-ai" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') onClose() }}>
      <div className="side-head">
        <span>Ask AI</span>
        <div className="seg">
          <button className={scope === 'thread' ? 'on' : ''} disabled={!thread} onClick={() => setScope('thread')}>This conversation</button>
          <button className={scope === 'inbox' ? 'on' : ''} onClick={() => setScope('inbox')}>Inbox</button>
        </div>
        <button className="close" onClick={onClose}>×</button>
      </div>
      <div className="chat" ref={listRef}>
        {turns.length === 0 && (
          <div className="chat-empty">
            <div className="big">What can I help you with today?</div>
            {(scope === 'thread' ? SUGGESTIONS_THREAD : SUGGESTIONS_INBOX).map((suggestion) => (
              <button key={suggestion} className="chip" onClick={() => void ask(suggestion)}>{suggestion}</button>
            ))}
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className={`turn ${turn.role}${turn.error ? ' error' : ''}`}>
            {turn.role === 'ai' && !turn.text && busy ? <span className="spinner" /> : renderAnswer(turn.text)}
            {turn.role === 'ai' && turn.text && !turn.error && scope === 'thread' && !busy && (
              <div className="turn-actions">
                <button className="chip" onClick={() => onUseAsReply(turn.text)}>Use as reply</button>
                <button className="chip" onClick={() => void navigator.clipboard.writeText(turn.text)}>Copy</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Find, write, or ask anything…"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void ask(input)
            }
            if (event.key === 'j' && event.metaKey && event.shiftKey) {
              event.preventDefault()
              setTurns([])
            }
          }}
        />
        <div className="hint-row">
          <Keys keys="Enter" /> send · <Keys keys="Escape" /> close · <Keys keys="meta+shift+j" /> new chat
        </div>
      </div>
    </aside>
  )
}
