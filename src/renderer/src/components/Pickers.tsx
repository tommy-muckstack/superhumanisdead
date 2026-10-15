import { useEffect, useMemo, useState } from 'react'
import { fuzzyFilter } from '@shared/fuzzy'
import type { LinkItem } from '@shared/links'
import { Keys } from './Overlays'

export interface PickItem {
  id: string
  label: string
  hint?: string
  checked?: boolean
}

/** One fuzzy list used by the folder menu (←), Move (V) and Labels (L). */
export function ListPicker({
  title,
  items,
  onPick,
  onClose,
  createLabel,
  onCreate,
  footer,
}: {
  title: string
  items: PickItem[]
  onPick: (item: PickItem) => void
  onClose: () => void
  /** When set, typing a name that matches nothing offers to create it. */
  createLabel?: string
  onCreate?: (name: string) => void
  footer?: string
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const filtered = useMemo(() => (query.trim() ? fuzzyFilter(query.trim(), items, (item) => item.label) : items), [items, query])
  const canCreate = Boolean(onCreate && query.trim() && !items.some((item) => item.label.toLowerCase() === query.trim().toLowerCase()))
  const rows: (PickItem & { create?: boolean })[] = canCreate ? [...filtered, { id: '__create', label: `${createLabel ?? 'Create'} “${query.trim()}”`, create: true }] : filtered
  useEffect(() => setActive(0), [query])

  const choose = (row: (PickItem & { create?: boolean }) | undefined) => {
    if (!row) return
    if (row.create) onCreate?.(query.trim())
    else onPick(row)
  }

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="picker list-picker" role="dialog" aria-label={title}>
        <div className="picker-title">{title}</div>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type to filter"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) setActive((index) => Math.min(index + 1, rows.length - 1))
            else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) setActive((index) => Math.max(index - 1, 0))
            else if (event.key === 'Enter') choose(rows[active])
            else if (event.key === 'Escape') onClose()
          }}
        />
        <div className="items">
          {rows.map((row, index) => (
            <div key={row.id} className={`item${index === active ? ' active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => choose(row)}>
              <span>
                {row.checked !== undefined && <span className="check">{row.checked ? '✓' : ''}</span>}
                {row.label}
              </span>
              {row.hint && <span className="when">{row.hint}</span>}
            </div>
          ))}
          {rows.length === 0 && <div className="item muted">Nothing matches</div>}
        </div>
        {footer && <div className="palette-hint">{footer}</div>}
      </div>
    </div>
  )
}

/** ⌘O: numbered links and attachments in the focused message. */
export function LinksPicker({ items, onOpen, onClose }: { items: LinkItem[]; onOpen: (item: LinkItem) => void; onClose: () => void }) {
  const [active, setActive] = useState(0)
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="picker list-picker"
        tabIndex={0}
        ref={(node) => node?.focus()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'ArrowDown' || event.key === 'j') setActive((index) => Math.min(index + 1, items.length - 1))
          else if (event.key === 'ArrowUp' || event.key === 'k') setActive((index) => Math.max(index - 1, 0))
          else if (event.key === 'Enter') items[active] && onOpen(items[active] as LinkItem)
          else if (event.key === 'Escape') onClose()
          else if (/^[1-9]$/.test(event.key) && items[Number(event.key) - 1]) onOpen(items[Number(event.key) - 1] as LinkItem)
        }}
      >
        <div className="picker-title">Open links and attachments</div>
        <div className="items">
          {items.map((item, index) => (
            <div key={`${item.url ?? item.attachmentId}-${index}`} className={`item${index === active ? ' active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => onOpen(item)}>
              <span>
                {index < 9 && <kbd style={{ marginRight: 8 }}>{index + 1}</kbd>}
                {item.kind === 'attachment' ? '📎 ' : ''}
                {item.label}
              </span>
              <span className="when">{item.kind === 'link' ? new URL(item.url ?? 'https://x').hostname : 'Save'}</span>
            </div>
          ))}
          {items.length === 0 && <div className="item muted">No links or attachments in this message</div>}
        </div>
        <div className="palette-hint"><Keys keys="Enter" /> open · <Keys keys="Escape" /> close</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, body, confirm, onConfirm, onClose }: { title: string; body: React.ReactNode; confirm: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="picker confirm"
        tabIndex={0}
        ref={(node) => node?.focus()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') onConfirm()
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="confirm-body">
          <h3>{title}</h3>
          <div>{body}</div>
        </div>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onClose}>Cancel <Keys keys="Escape" /></button>
          <button className="btn primary" onClick={onConfirm}>{confirm} <Keys keys="Enter" /></button>
        </div>
      </div>
    </div>
  )
}
