import { useEffect, useMemo, useRef, useState } from 'react'
import { BINDINGS, SNOOZE_PRESETS, type Command } from '@shared/keys'
import { whenSnooze } from '../lib/format'

export interface Toast {
  id: number
  text: string
  undo?: () => void
  error?: boolean
}

export function Toasts({ toasts, onUndo }: { toasts: Toast[]; onUndo: (toast: Toast) => void }) {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.error ? ' error' : ''}`}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="undo" onClick={() => onUndo(toast)}>
              Undo <kbd>z</kbd>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function keysOf(keys: string): string[] {
  return keys.split(' ').map((chord) => chord.replace('meta+', '⌘').replace('shift+', '⇧').replace('alt+', '⌥').replace('Enter', '↵').replace('Escape', 'esc').replace('shift+/', '?'))
}

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="shortcuts">
        <h2>Keyboard shortcuts</h2>
        <div className="grid">
          {BINDINGS.map((binding) => (
            <div className="sc" key={binding.keys}>
              <span>{binding.label}</span>
              <span className="keys">
                {keysOf(binding.keys).map((key, index) => (
                  <kbd key={index}>{key === '?' ? '?' : key}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
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
  useEffect(() => inputRef.current?.focus(), [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => item.label.toLowerCase().includes(needle) || item.hint?.toLowerCase().includes(needle))
  }, [items, query])

  useEffect(() => setActive(0), [query])

  const onKey = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, filtered.length - 1))
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter') {
      const item = filtered[active]
      if (item) {
        onClose()
        item.run()
      }
    } else if (event.key === 'Escape') onClose()
  }

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" onKeyDown={onKey}>
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command…" />
        <div className="items">
          {filtered.map((item, index) => (
            <div
              key={item.id}
              className={`item${index === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                onClose()
                item.run()
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="hint">{item.hint}</span>}
              {item.keys && (
                <span className="keys">
                  {keysOf(item.keys).map((key, keyIndex) => (
                    <kbd key={keyIndex}>{key}</kbd>
                  ))}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="item">No matching commands</div>}
        </div>
      </div>
    </div>
  )
}

export function SnoozeMenu({ onPick, onClose }: { onPick: (until: Date) => void; onClose: () => void }) {
  const [active, setActive] = useState(0)
  const [custom, setCustom] = useState('')
  const now = useMemo(() => new Date(), [])
  const options = SNOOZE_PRESETS.map((preset) => ({ ...preset, at: preset.until(now) }))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const onKey = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'ArrowDown' || event.key === 'j') setActive((index) => Math.min(index + 1, options.length - 1))
    else if (event.key === 'ArrowUp' || event.key === 'k') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter') {
      const option = options[active]
      if (option) onPick(option.at)
    } else if (event.key === 'Escape') onClose()
    else {
      const digit = Number(event.key)
      const option = Number.isInteger(digit) && digit >= 1 ? options[digit - 1] : undefined
      if (option) onPick(option.at)
    }
  }

  return (
    <div className="scrim" style={{ paddingTop: '20vh' }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="popover" style={{ position: 'static', width: 320 }} tabIndex={0} ref={ref} onKeyDown={onKey}>
        {options.map((option, index) => (
          <div key={option.id} className={`item${index === active ? ' active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => onPick(option.at)}>
            <span>
              <kbd style={{ marginRight: 8 }}>{index + 1}</kbd>
              {option.label}
            </span>
            <span className="when">{whenSnooze(option.at.getTime())}</span>
          </div>
        ))}
        <div className="custom">
          <span>Pick a time</span>
          <input
            type="datetime-local"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && custom) onPick(new Date(custom))
              if (event.key === 'Escape') onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function commandLabel(command: Command): string {
  return BINDINGS.find((binding) => binding.command === command)?.label ?? command
}
