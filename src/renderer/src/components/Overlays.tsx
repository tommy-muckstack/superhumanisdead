import { useEffect, useMemo, useRef, useState } from 'react'
import { BINDINGS, keycaps, type Section } from '@shared/keys'
import { fuzzyFilter } from '@shared/fuzzy'
import { parseRemind, remindPresets } from '@shared/remind'
import { sendLaterPresets } from '@shared/schedule'
import { expandSnippet, type Snippet, type SnippetContext } from '@shared/snippets'
import { whenSnooze } from '../lib/format'

export interface Toast {
  id: number
  text: string
  undo?: () => void
  error?: boolean
  /** Toast lifetime in ms (undo send uses the undo window). */
  ttl?: number
}

export function Keys({ keys }: { keys: string }) {
  const caps = keycaps(keys)
  return (
    <span className="keys">
      {caps.map((cap, index) => (
        <span key={index} style={{ display: 'contents' }}>
          {index > 0 && <span className="then">then</span>}
          <kbd>{cap}</kbd>
        </span>
      ))}
    </span>
  )
}

export function Toasts({ toasts, onUndo }: { toasts: Toast[]; onUndo: (toast: Toast) => void }) {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.error ? ' error' : ''}`}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="undo" onClick={() => onUndo(toast)}>
              Undo <kbd>Z</kbd>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const SECTIONS: Section[] = ['Actions', 'Navigation', 'Conversations', 'Messages', 'Compose', 'Folders', 'AI', 'Calendar']

export function Shortcuts({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const withKeys = BINDINGS.filter((binding) => binding.keys)
    return query ? fuzzyFilter(query, withKeys, (binding) => [binding.label, binding.section]) : withKeys
  }, [query])
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="shortcuts" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') onClose() }}>
        <input autoFocus className="sc-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shortcuts" />
        {SECTIONS.map((section) => {
          const rows = shown.filter((binding) => binding.section === section)
          if (!rows.length) return null
          return (
            <div key={section}>
              <h3>{section}</h3>
              <div className="grid">
                {rows.map((binding) => (
                  <div className="sc" key={`${binding.keys}-${binding.command}`}>
                    <span>{binding.label}</span>
                    <Keys keys={binding.keys} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  keys?: string
  run: () => void
}

export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => (query.trim() ? fuzzyFilter(query.trim(), items, (item) => [item.label, item.hint ?? '']) : items), [items, query])
  useEffect(() => setActive(0), [query])

  const pick = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKey = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, filtered.length - 1))
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter') pick(filtered[active])
    else if (event.key === 'Escape') onClose()
  }

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" onKeyDown={onKey}>
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command or search…" />
        <div className="items">
          {filtered.map((item, index) => (
            <div key={item.id} className={`item${index === active ? ' active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => pick(item)}>
              <span>{item.label}</span>
              {item.hint && <span className="hint">{item.hint}</span>}
              {item.keys && <Keys keys={item.keys} />}
            </div>
          ))}
          {filtered.length === 0 && <div className="item">No matching commands</div>}
        </div>
        <div className="palette-hint">Each command shows its shortcut. Learn it once and skip ⌘K next time.</div>
      </div>
    </div>
  )
}

export interface TimeChoice {
  at: Date
  ifNoReply: boolean
}

/**
 * Remind Me / Send Later picker: type natural language ("tomorrow 3pm", "2d", "next week")
 * or pick a preset by number. Remind Me can be limited to "only if nobody replies".
 */
export function TimePicker({
  kind,
  weekdaysOnly,
  onPick,
  onClose,
}: {
  kind: 'remind' | 'sendLater' | 'remindCompose'
  weekdaysOnly?: boolean
  onPick: (choice: TimeChoice) => void
  onClose: () => void
}) {
  const now = useMemo(() => new Date(), [])
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const [ifNoReply, setIfNoReply] = useState(kind === 'remindCompose')
  const presets = useMemo(() => {
    if (kind === 'sendLater') return sendLaterPresets(now)
    return remindPresets(now, { weekdaysOnly })
      .filter((preset) => preset.at)
      .map((preset) => ({ label: preset.label.charAt(0).toUpperCase() + preset.label.slice(1), at: preset.at as Date }))
  }, [kind, now, weekdaysOnly])
  const parsed = text.trim() ? parseRemind(text, now, { weekdaysOnly }) : null
  const options = parsed ? [{ label: text.trim(), at: parsed }] : presets

  const choose = (at: Date | undefined) => {
    if (!at) return
    if (at.getTime() <= Date.now()) return
    onPick({ at, ifNoReply })
  }

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, options.length - 1))
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter') {
      event.preventDefault()
      choose(options[active]?.at)
    } else if (event.key === 'Escape') onClose()
    else if (!text && /^[1-9]$/.test(event.key)) {
      event.preventDefault()
      choose(presets[Number(event.key) - 1]?.at)
    } else if (event.key === 'r' && event.metaKey && kind !== 'sendLater') {
      event.preventDefault()
      setIfNoReply((value) => !value)
    }
  }

  useEffect(() => setActive(0), [text])
  const title = kind === 'sendLater' ? 'Send later' : kind === 'remindCompose' ? 'Remind me if no reply' : 'Remind me'

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="picker">
        <div className="picker-title">{title}</div>
        <input autoFocus value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} placeholder="Try: tomorrow 3pm, 2d, next friday, oct 20 9am" />
        <div className="items">
          {options.map((option, index) => (
            <div key={option.label} className={`item${index === active ? ' active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => choose(option.at)}>
              <span>
                {!parsed && <kbd style={{ marginRight: 8 }}>{index + 1}</kbd>}
                {option.label}
              </span>
              <span className="when">{whenSnooze(option.at.getTime())}</span>
            </div>
          ))}
          {text.trim() && !parsed && <div className="item muted">Keep typing… (e.g. "3h", "monday 9am")</div>}
        </div>
        {kind !== 'sendLater' && (
          <label className="picker-toggle">
            <input type="checkbox" checked={ifNoReply} onChange={(event) => setIfNoReply(event.target.checked)} />
            Only if nobody replies <Keys keys="meta+r" />
          </label>
        )}
      </div>
    </div>
  )
}

export function SnippetPicker({
  snippets,
  initialQuery = '',
  context,
  onPick,
  onClose,
  onManage,
}: {
  snippets: Snippet[]
  initialQuery?: string
  context: SnippetContext
  onPick: (snippet: Snippet) => void
  onClose: () => void
  onManage?: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const filtered = useMemo(() => {
    const sorted = [...snippets].sort((a, b) => b.sends - a.sends)
    return query ? fuzzyFilter(query, sorted, (snippet) => [snippet.name, snippet.body]) : sorted
  }, [snippets, query])
  const current = filtered[active]
  useEffect(() => setActive(0), [query])
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette snippets-picker">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search snippets"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, filtered.length - 1))
            else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
            else if (event.key === 'Enter' && current) onPick(current)
            else if (event.key === 'Escape') onClose()
          }}
        />
        <div className="split-view">
          <div className="items">
            {filtered.map((snippet, index) => (
              <div key={snippet.id} className={`item${index === active ? ' active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => onPick(snippet)}>
                <span>{snippet.name}</span>
                <span className="hint">;{snippet.name.toLowerCase().replace(/\s+/g, '-')}</span>
              </div>
            ))}
            {filtered.length === 0 && <div className="item">No snippets match</div>}
          </div>
          {current && <pre className="preview">{expandSnippet(current.body, context)}</pre>}
        </div>
        {onManage && (
          <div className="palette-hint">
            <button onClick={onManage}>Manage snippets</button> <Keys keys="g ;" />
          </div>
        )}
      </div>
    </div>
  )
}

export function SnippetManager({ snippets, onSave, onClose }: { snippets: Snippet[]; onSave: (snippets: Snippet[]) => void; onClose: () => void }) {
  const [list, setList] = useState(snippets)
  const [selected, setSelected] = useState(snippets[0]?.id ?? '')
  const current = list.find((snippet) => snippet.id === selected)
  const patch = (changes: Partial<Snippet>) => setList((previous) => previous.map((snippet) => (snippet.id === selected ? { ...snippet, ...changes, updatedAt: Date.now() } : snippet)))
  const add = () => {
    const snippet: Snippet = { id: `s-${Date.now()}`, name: 'New snippet', body: 'Hi {first_name},\n\n', sends: 0, updatedAt: Date.now() }
    setList((previous) => [snippet, ...previous])
    setSelected(snippet.id)
  }
  const remove = () => {
    const next = list.filter((snippet) => snippet.id !== selected)
    setList(next)
    setSelected(next[0]?.id ?? '')
  }
  const close = () => {
    onSave(list)
    onClose()
  }
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="manager" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') close() }}>
        <div className="manager-list">
          <button className="btn" onClick={add}>New snippet</button>
          {list.map((snippet) => (
            <div key={snippet.id} className={`item${snippet.id === selected ? ' active' : ''}`} onClick={() => setSelected(snippet.id)}>
              <span>{snippet.name}</span>
              <span className="hint">{snippet.sends} sends</span>
            </div>
          ))}
        </div>
        {current ? (
          <div className="manager-edit">
            <input value={current.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Name" />
            <input value={current.subject ?? ''} onChange={(event) => patch({ subject: event.target.value })} placeholder="Subject (optional)" />
            <textarea value={current.body} onChange={(event) => patch({ body: event.target.value })} />
            <div className="manager-bar">
              <span className="hint">Variables: {'{first_name} {last_name} {my_first_name} {date} {weekday} {company|fallback}'}</span>
              <button className="btn ghost" onClick={remove}>Delete</button>
              <button className="btn primary" onClick={close}>Done</button>
            </div>
          </div>
        ) : (
          <div className="manager-edit empty">No snippets yet</div>
        )}
      </div>
    </div>
  )
}
