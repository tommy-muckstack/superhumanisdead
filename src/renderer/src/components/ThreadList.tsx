import { useEffect, useRef } from 'react'
import { SPLITS } from '@shared/splits'
import type { Split, ThreadSummary } from '@shared/types'
import { avatarColor, initials, participantsLabel, whenShort, whenSnooze } from '../lib/format'

interface Props {
  split: Split
  counts: Partial<Record<Split, number>>
  threads: ThreadSummary[]
  selected: number
  checked: Set<string>
  loading: boolean
  hasMore: boolean
  me: string
  search: string
  searchRef: React.RefObject<HTMLInputElement | null>
  onSearch: (value: string) => void
  onSearchSubmit: () => void
  onSelectSplit: (split: Split) => void
  onSelect: (index: number) => void
  onOpen: (index: number) => void
  onLoadMore: () => void
}

const VISIBLE_TABS: Split[] = ['important', 'other', 'starred', 'snoozed']

export function ThreadList(props: Props) {
  const { threads, selected } = props
  const rowsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const row = rowsRef.current?.children[selected] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [selected, threads])

  const activeIsHidden = !VISIBLE_TABS.includes(props.split)
  const tabs = activeIsHidden ? [...VISIBLE_TABS, props.split] : VISIBLE_TABS

  return (
    <div className="list">
      <div className="list-header">
        <div className="splits">
          {tabs.map((split) => {
            const meta = SPLITS.find((entry) => entry.id === split)
            const count = props.counts[split]
            return (
              <button key={split} className={`split-tab${split === props.split ? ' active' : ''}`} onClick={() => props.onSelectSplit(split)}>
                {meta?.label ?? split}
                {count !== undefined && count > 0 && <span className="count">{count}</span>}
              </button>
            )
          })}
        </div>
        <div className="search">
          <span>⌕</span>
          <input
            ref={props.searchRef}
            value={props.search}
            placeholder="Search"
            onChange={(event) => props.onSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                props.onSearchSubmit()
                ;(event.target as HTMLInputElement).blur()
              }
              if (event.key === 'Escape') {
                props.onSearch('')
                props.onSearchSubmit()
                ;(event.target as HTMLInputElement).blur()
              }
              event.stopPropagation()
            }}
          />
          <kbd>/</kbd>
        </div>
      </div>

      <div className="rows" ref={rowsRef}>
        {threads.map((thread, index) => {
          const first = thread.participants[0] ?? { name: '?', email: '' }
          return (
            <div
              key={thread.id}
              className={`row${index === selected ? ' selected' : ''}${thread.unread ? ' unread' : ''}${props.checked.has(thread.id) ? ' checked' : ''}`}
              onClick={() => props.onSelect(index)}
              onDoubleClick={() => props.onOpen(index)}
            >
              <span className="dot" />
              <span className="avatar" style={{ background: avatarColor(first.email) }}>{initials(first)}</span>
              <div className="main">
                <div className="line1">
                  <span className="who">{participantsLabel(thread.participants, props.me)}</span>
                  {thread.messageCount > 1 && <span className="count">{thread.messageCount}</span>}
                </div>
                <div className="line2">
                  <span className="subject">{thread.subject}</span>
                  <span className="snippet">– {thread.snippet}</span>
                </div>
              </div>
              <div className="meta">
                <span className="when">{thread.snoozedUntil ? whenSnooze(thread.snoozedUntil) : whenShort(thread.lastDate)}</span>
                {thread.starred && <span className="star">★</span>}
              </div>
            </div>
          )
        })}
        {!props.loading && threads.length === 0 && (
          <div className="empty">
            <div className="big">{props.split === 'important' ? 'Inbox zero' : 'Nothing here'}</div>
            <div>{props.split === 'important' ? 'Enjoy the quiet.' : ''}</div>
          </div>
        )}
      </div>
      <div className="list-footer">
        <span>{props.loading ? <><span className="spinner" /> Loading</> : `${threads.length} conversations`}</span>
        {props.hasMore && !props.loading && <button onClick={props.onLoadMore}>Load more</button>}
      </div>
    </div>
  )
}
