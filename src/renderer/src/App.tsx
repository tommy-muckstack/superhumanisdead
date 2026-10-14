import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BINDINGS, KeySequencer, type Command } from '@shared/keys'
import { messageText } from '@shared/gmail-parse'
import { formatAddress, quoteForReply, textToHtml } from '@shared/mime'
import { SPLITS } from '@shared/splits'
import type { Account, Settings, Snooze, Split, Thread, ThreadSummary } from '@shared/types'
import { Composer, type Draft } from './components/Composer'
import { CommandPalette, Shortcuts, SnoozeMenu, Toasts, type PaletteItem, type Toast } from './components/Overlays'
import { Setup } from './components/Setup'
import { ThreadList } from './components/ThreadList'
import { ThreadView } from './components/ThreadView'
import * as gmail from './lib/gmail'
import { DEMO_EMAIL } from './lib/demo'
import { cleanReplySubject, forwardSubject, whenLong, whenSnooze } from './lib/format'

type Overlay = 'palette' | 'shortcuts' | 'snooze' | 'settings' | null

interface SplitState {
  threads: ThreadSummary[]
  nextPageToken?: string
  loaded: boolean
}

const EMPTY_SPLIT: SplitState = { threads: [], loaded: false }
const MOVED_KEY = 'duperhuman.moved'

function loadMoved(): Record<string, 'important' | 'other'> {
  try {
    return JSON.parse(localStorage.getItem(MOVED_KEY) ?? '{}') as Record<string, 'important' | 'other'>
  } catch {
    return {}
  }
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [account, setAccount] = useState<Account>({ email: '', signedIn: false })
  const [split, setSplit] = useState<Split>('important')
  const [splits, setSplits] = useState<Record<string, SplitState>>({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [openThread, setOpenThread] = useState<Thread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pendingDraft, setPendingDraft] = useState<Draft['mode'] | null>(null)
  const [sending, setSending] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [summary, setSummary] = useState<{ text: string; loading: boolean } | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [snoozes, setSnoozes] = useState<Snooze[]>([])
  const [moved, setMoved] = useState<Record<string, 'important' | 'other'>>(loadMoved)
  const [movedThreads, setMovedThreads] = useState<Record<string, ThreadSummary>>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const sequencer = useMemo(() => new KeySequencer(), [])
  const toastId = useRef(0)
  const me = account.email

  const toast = useCallback((text: string, options: { undo?: () => void; error?: boolean } = {}) => {
    const id = ++toastId.current
    setToasts((previous) => [...previous.slice(-2), { id, text, ...options }])
    setTimeout(() => setToasts((previous) => previous.filter((entry) => entry.id !== id)), options.undo ? 6000 : 3500)
  }, [])

  const fail = useCallback((error: unknown) => toast(error instanceof Error ? error.message : String(error), { error: true }), [toast])

  const visibleThreads = useMemo(() => {
    const own = splits[split]?.threads ?? []
    if (split !== 'important' && split !== 'other') return own
    const kept = own.filter((thread) => (moved[thread.id] ?? split) === split)
    const incoming = Object.values(movedThreads).filter((thread) => moved[thread.id] === split && !own.some((entry) => entry.id === thread.id))
    return [...incoming, ...kept].sort((a, b) => b.lastDate - a.lastDate)
  }, [splits, split, moved, movedThreads])

  const counts = useMemo(() => {
    const result: Partial<Record<Split, number>> = {}
    for (const entry of SPLITS) {
      const threads = splits[entry.id]?.threads
      if (threads) result[entry.id] = entry.id === 'snoozed' ? threads.length : threads.filter((thread) => thread.unread).length
    }
    return result
  }, [splits])

  const patchThread = useCallback((id: string, patch: Partial<ThreadSummary>) => {
    setSplits((previous) => {
      const next: Record<string, SplitState> = {}
      for (const [key, state] of Object.entries(previous)) {
        next[key] = { ...state, threads: state.threads.map((thread) => (thread.id === id ? { ...thread, ...patch } : thread)) }
      }
      return next
    })
    setMovedThreads((previous) => (previous[id] ? { ...previous, [id]: { ...previous[id], ...patch } as ThreadSummary } : previous))
    setOpenThread((previous) => (previous?.id === id ? { ...previous, ...patch } : previous))
  }, [])

  const removeFromLists = useCallback((id: string) => {
    setSplits((previous) => {
      const next: Record<string, SplitState> = {}
      for (const [key, state] of Object.entries(previous)) next[key] = { ...state, threads: state.threads.filter((thread) => thread.id !== id) }
      return next
    })
    setMovedThreads((previous) => {
      const { [id]: _removed, ...rest } = previous
      return rest
    })
  }, [])

  const insertInto = useCallback((target: Split, thread: ThreadSummary) => {
    setSplits((previous) => {
      const state = previous[target] ?? EMPTY_SPLIT
      if (state.threads.some((entry) => entry.id === thread.id)) return previous
      const threads = [...state.threads, thread].sort((a, b) => b.lastDate - a.lastDate)
      return { ...previous, [target]: { ...state, threads } }
    })
  }, [])

  const loadSplit = useCallback(
    async (target: Split, options: { more?: boolean; query?: string } = {}) => {
      if (!me) return
      setLoading(true)
      try {
        if (target === 'snoozed') {
          const list = await window.duper.snooze.list()
          setSnoozes(list)
          const summaries = await gmail.summariesFor(list.map((entry) => entry.threadId), me)
          const threads = summaries.map((thread) => ({ ...thread, snoozedUntil: list.find((entry) => entry.threadId === thread.id)?.until }))
          setSplits((previous) => ({ ...previous, snoozed: { threads, loaded: true } }))
          return
        }
        const current = splits[target]
        const pageToken = options.more ? current?.nextPageToken : undefined
        const page = await gmail.listThreads(target, me, pageToken, options.query ?? activeSearch)
        setSplits((previous) => {
          const existing = options.more ? (previous[target]?.threads ?? []) : []
          const ids = new Set(existing.map((thread) => thread.id))
          return { ...previous, [target]: { threads: [...existing, ...page.threads.filter((thread) => !ids.has(thread.id))], nextPageToken: page.nextPageToken, loaded: true } }
        })
      } catch (error) {
        fail(error)
      } finally {
        setLoading(false)
      }
    },
    [me, splits, activeSearch, fail],
  )

  useEffect(() => {
    void (async () => {
      const [loadedSettings, status] = await Promise.all([window.duper.settings.get(), window.duper.auth.status()])
      setSettings(loadedSettings)
      setAccount(status)
    })()
  }, [])

  useEffect(() => {
    if (!me) return
    void loadSplit('important')
    void loadSplit('other')
    void window.duper.snooze.list().then(setSnoozes)
    return window.duper.snooze.onWake((snooze) => {
      toast(`Back in your inbox: ${snooze.subject}`)
      void loadSplit('important')
      void loadSplit('snoozed')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  useEffect(() => {
    if (!me) return
    if (!splits[split]?.loaded) void loadSplit(split)
    setSelected(0)
    setChecked(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, me])

  const selectedThread = visibleThreads[selected] ?? null

  useEffect(() => {
    if (!selectedThread || !me) {
      setOpenThread(null)
      return
    }
    if (openThread?.id === selectedThread.id) return
    let cancelled = false
    setSummary(null)
    setDraft(null)
    const timer = setTimeout(() => {
      setThreadLoading(true)
      gmail
        .getThread(selectedThread.id, me)
        .then((thread) => {
          if (cancelled) return
          setOpenThread(thread)
          if (thread.unread) {
            patchThread(thread.id, { unread: false })
            gmail.setUnread(thread.id, false).catch(fail)
          }
        })
        .catch(fail)
        .finally(() => !cancelled && setThreadLoading(false))
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread?.id, me])

  useEffect(() => localStorage.setItem(MOVED_KEY, JSON.stringify(moved)), [moved])

  const targets = useCallback((): ThreadSummary[] => {
    if (checked.size) return visibleThreads.filter((thread) => checked.has(thread.id))
    return selectedThread ? [selectedThread] : []
  }, [checked, visibleThreads, selectedThread])

  const markDone = useCallback(async () => {
    const list = targets()
    if (!list.length) return
    const restoring = split === 'done'
    list.forEach((thread) => removeFromLists(thread.id))
    setChecked(new Set())
    try {
      await Promise.all(list.map((thread) => (restoring ? gmail.unarchive(thread.id) : gmail.archive(thread.id))))
      toast(restoring ? (list.length > 1 ? `Moved ${list.length} to inbox` : 'Moved to inbox') : list.length > 1 ? `Marked ${list.length} done` : 'Marked done', {
        undo: () => {
          list.forEach((thread) => insertInto(split, thread))
          Promise.all(list.map((thread) => (restoring ? gmail.archive(thread.id) : gmail.unarchive(thread.id)))).catch(fail)
        },
      })
    } catch (error) {
      list.forEach((thread) => insertInto(split, thread))
      fail(error)
    }
  }, [targets, split, removeFromLists, insertInto, toast, fail])

  const snoozeUntil = useCallback(
    async (until: Date) => {
      setOverlay(null)
      const list = targets()
      if (!list.length) return
      list.forEach((thread) => removeFromLists(thread.id))
      setChecked(new Set())
      try {
        for (const thread of list) {
          if (window.duperDemo) {
            await gmail.modifyThread(thread.id, [], ['INBOX'])
            setSnoozes((previous) => [...previous, { threadId: thread.id, until: until.getTime(), subject: thread.subject }])
            continue
          }
          const next = await window.duper.snooze.add({ threadId: thread.id, until: until.getTime(), subject: thread.subject })
          setSnoozes(next)
        }
        setSplits((previous) => ({ ...previous, snoozed: { ...(previous.snoozed ?? EMPTY_SPLIT), loaded: false } }))
        toast(`Snoozed until ${whenSnooze(until.getTime())}`, {
          undo: () => {
            list.forEach((thread) => insertInto(split, thread))
            Promise.all(list.map((thread) => window.duper.snooze.remove(thread.id))).then((results) => results.at(-1) && setSnoozes(results.at(-1) ?? [])).catch(fail)
          },
        })
      } catch (error) {
        list.forEach((thread) => insertInto(split, thread))
        fail(error)
      }
    },
    [targets, removeFromLists, insertInto, split, toast, fail],
  )

  const unsnooze = useCallback(async () => {
    const list = targets()
    list.forEach((thread) => removeFromLists(thread.id))
    try {
      for (const thread of list) setSnoozes(await window.duper.snooze.remove(thread.id))
      toast(list.length > 1 ? `Moved ${list.length} to inbox` : 'Moved to inbox')
      void loadSplit('important')
    } catch (error) {
      fail(error)
    }
  }, [targets, removeFromLists, toast, loadSplit, fail])

  const toggleStar = useCallback(() => {
    for (const thread of targets()) {
      patchThread(thread.id, { starred: !thread.starred })
      gmail.setStarred(thread.id, !thread.starred).catch(fail)
    }
  }, [targets, patchThread, fail])

  const toggleUnread = useCallback(() => {
    for (const thread of targets()) {
      patchThread(thread.id, { unread: !thread.unread })
      gmail.setUnread(thread.id, !thread.unread).catch(fail)
    }
    if (selectedThread && !selectedThread.unread) setSelected((index) => Math.min(index + 1, visibleThreads.length - 1))
  }, [targets, patchThread, fail, selectedThread, visibleThreads.length])

  const startDraft = useCallback(
    (mode: Draft['mode']) => {
      if (mode === 'new') {
        setDraft({ mode: 'new', to: '', cc: '', bcc: '', subject: '', body: '', quoted: '' })
        return
      }
      if (!openThread || openThread.id !== selectedThread?.id) {
        // The reading pane is still loading the newly selected thread; reply once it lands.
        if (selectedThread) setPendingDraft(mode)
        return
      }
      const last = openThread.messages[openThread.messages.length - 1]
      if (!last) return
      const others = (addresses: typeof last.to) => addresses.filter((address) => address.email !== me)
      const replyTo = last.from.email === me ? last.to : [last.from]
      const base = {
        threadId: openThread.id,
        inReplyTo: last.body.messageId,
        references: [last.body.references, last.body.messageId].filter(Boolean).join(' ') || null,
        quoted: quoteForReply(messageText(last), last.from, last.date),
        body: '',
        bcc: '',
      }
      if (mode === 'reply') {
        setDraft({ ...base, mode, to: replyTo.map(formatAddress).join(', '), cc: '', subject: cleanReplySubject(openThread.subject) })
      } else if (mode === 'replyAll') {
        const cc = others([...last.to, ...last.cc]).filter((address) => !replyTo.some((entry) => entry.email === address.email))
        setDraft({ ...base, mode, to: replyTo.map(formatAddress).join(', '), cc: cc.map(formatAddress).join(', '), subject: cleanReplySubject(openThread.subject) })
      } else {
        const header = `---------- Forwarded message ----------\nFrom: ${formatAddress(last.from)}\nDate: ${whenLong(last.date)}\nSubject: ${openThread.subject}\nTo: ${last.to.map(formatAddress).join(', ')}\n\n`
        setDraft({ ...base, mode, to: '', cc: '', subject: forwardSubject(openThread.subject), body: `\n\n${header}${messageText(last)}`, quoted: '', inReplyTo: null, references: null, threadId: undefined })
      }
    },
    [openThread, selectedThread, me],
  )

  useEffect(() => {
    if (pendingDraft && openThread && openThread.id === selectedThread?.id) {
      setPendingDraft(null)
      startDraft(pendingDraft)
    }
  }, [pendingDraft, openThread, selectedThread?.id, startDraft])

  const sendDraft = useCallback(async () => {
    if (!draft || !me) return
    const splitList = (value: string) => value.split(',').map((entry) => entry.trim()).filter(Boolean)
    const signature = settings?.signature ? `\n\n${settings.signature}` : ''
    const text = `${draft.body}${signature}${draft.quoted}`
    setSending(true)
    try {
      await gmail.send(
        { to: splitList(draft.to), cc: splitList(draft.cc), bcc: splitList(draft.bcc), subject: draft.subject, text, html: textToHtml(text), threadId: draft.threadId, inReplyTo: draft.inReplyTo, references: draft.references },
        me,
      )
      setDraft(null)
      toast('Sent')
      if (draft.threadId && openThread?.id === draft.threadId) {
        gmail.getThread(draft.threadId, me).then(setOpenThread).catch(fail)
      }
      setSplits((previous) => ({ ...previous, sent: { ...(previous.sent ?? EMPTY_SPLIT), loaded: false } }))
    } catch (error) {
      fail(error)
    } finally {
      setSending(false)
    }
  }, [draft, me, settings, toast, openThread, fail])

  const summarize = useCallback(async () => {
    if (!openThread) return
    setSummary({ text: '', loading: true })
    try {
      const text = await window.duper.ai.complete({ kind: 'summarize', thread: openThread, me })
      setSummary({ text, loading: false })
    } catch (error) {
      setSummary(null)
      fail(error)
    }
  }, [openThread, me, fail])

  const aiDraft = useCallback(
    async (instruction?: string) => {
      if (!openThread) return
      let current = draft
      if (!current || current.mode === 'new') {
        startDraft('reply')
        current = null
      }
      setAiBusy(true)
      let body = ''
      try {
        await window.duper.ai.stream({ kind: 'draft', thread: openThread, me, instruction }, (chunk) => {
          body += chunk
          setDraft((previous) => (previous ? { ...previous, body } : previous))
        })
      } catch (error) {
        fail(error)
      } finally {
        setAiBusy(false)
      }
    },
    [openThread, draft, me, startDraft, fail],
  )

  const triage = useCallback(async () => {
    if (split !== 'important' && split !== 'other') {
      toast('AI sorting works in Important and Other')
      return
    }
    toast('Sorting with AI…')
    try {
      const results = await window.duper.ai.triage(visibleThreads, me)
      const changed = results.filter((result) => result.split !== split)
      setMoved((previous) => {
        const next = { ...previous }
        changed.forEach((result) => {
          next[result.threadId] = result.split
        })
        return next
      })
      setMovedThreads((previous) => {
        const next = { ...previous }
        changed.forEach((result) => {
          const thread = visibleThreads.find((entry) => entry.id === result.threadId)
          if (thread) next[thread.id] = thread
        })
        return next
      })
      toast(changed.length ? `Moved ${changed.length} to ${split === 'important' ? 'Other' : 'Important'}` : 'Already sorted')
    } catch (error) {
      fail(error)
    }
  }, [split, visibleThreads, me, toast, fail])

  const undo = useCallback(() => {
    const last = [...toasts].reverse().find((entry) => entry.undo)
    if (!last) return
    last.undo?.()
    setToasts((previous) => previous.filter((entry) => entry.id !== last.id))
  }, [toasts])

  const run = useCallback(
    (command: Command) => {
      const goto = (target: Split) => {
        setActiveSearch('')
        setSearch('')
        setSplit(target)
      }
      switch (command) {
        case 'next':
          setSelected((index) => {
            if (index + 1 >= visibleThreads.length && splits[split]?.nextPageToken) void loadSplit(split, { more: true })
            return Math.min(index + 1, Math.max(visibleThreads.length - 1, 0))
          })
          break
        case 'prev':
          setSelected((index) => Math.max(index - 1, 0))
          break
        case 'open':
          break
        case 'back':
          if (draft) setDraft(null)
          else if (summary) setSummary(null)
          else setChecked(new Set())
          break
        case 'done':
          void markDone()
          break
        case 'snooze':
          if (split === 'snoozed') void unsnooze()
          else if (selectedThread) setOverlay('snooze')
          break
        case 'reply':
          startDraft('reply')
          break
        case 'replyAll':
          startDraft('replyAll')
          break
        case 'forward':
          startDraft('forward')
          break
        case 'compose':
          startDraft('new')
          break
        case 'star':
          toggleStar()
          break
        case 'unread':
          toggleUnread()
          break
        case 'select':
          if (selectedThread) {
            setChecked((previous) => {
              const next = new Set(previous)
              if (next.has(selectedThread.id)) next.delete(selectedThread.id)
              else next.add(selectedThread.id)
              return next
            })
            setSelected((index) => Math.min(index + 1, visibleThreads.length - 1))
          }
          break
        case 'undo':
          undo()
          break
        case 'palette':
          setOverlay('palette')
          break
        case 'search':
          searchRef.current?.focus()
          break
        case 'nextSplit':
        case 'prevSplit': {
          const order: Split[] = ['important', 'other', 'starred', 'snoozed']
          const index = order.indexOf(split)
          const next = order[(index + (command === 'nextSplit' ? 1 : order.length - 1)) % order.length]
          if (next) goto(next)
          break
        }
        case 'goImportant':
          goto('important')
          break
        case 'goOther':
          goto('other')
          break
        case 'goStarred':
          goto('starred')
          break
        case 'goSnoozed':
          goto('snoozed')
          break
        case 'goSent':
          goto('sent')
          break
        case 'goDrafts':
          goto('drafts')
          break
        case 'goDone':
          goto('done')
          break
        case 'summarize':
          void summarize()
          break
        case 'draftReply':
          void aiDraft()
          break
        case 'help':
          setOverlay('shortcuts')
          break
        case 'refresh':
          void loadSplit(split)
          break
      }
    },
    [visibleThreads.length, splits, split, loadSplit, draft, summary, markDone, unsnooze, selectedThread, startDraft, toggleStar, toggleUnread, undo, summarize, aiDraft],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (overlay) return
      if (isTyping(event.target) && !event.metaKey) return
      const command = sequencer.feed(event)
      if (!command) return
      event.preventDefault()
      run(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, sequencer, run])

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const commands: PaletteItem[] = BINDINGS.filter((binding) => !['next', 'prev', 'open', 'palette'].includes(binding.command)).map((binding) => ({
      id: binding.command,
      label: binding.label,
      keys: binding.keys,
      run: () => run(binding.command),
    }))
    return [
      { id: 'triage', label: 'Sort this list with AI', hint: 'Moves newsletters and notifications to Other', run: () => void triage() },
      ...commands,
      { id: 'settings', label: 'Settings', hint: account.email, run: () => setOverlay('settings') },
      { id: 'signout', label: 'Sign out', run: () => void window.duper.auth.signOut().then(() => setAccount({ email: '', signedIn: false })) },
    ]
  }, [run, triage, account.email])

  const saveSettings = async (patch: Partial<Settings>) => setSettings(await window.duper.settings.set(patch))
  const signIn = async () => setAccount(await window.duper.auth.signIn())
  const startDemo = () => {
    window.duperDemo = true
    setAccount({ email: DEMO_EMAIL, signedIn: true })
  }
  const signOut = async () => {
    window.duperDemo = false
    if (!window.duperDemo && account.email !== DEMO_EMAIL) await window.duper.auth.signOut()
    setAccount({ email: '', signedIn: false })
    setSplits({})
    setOverlay(null)
  }

  if (!settings) return <div className="setup" />
  if (!account.signedIn) return <Setup settings={settings} signedIn={false} email="" onSave={saveSettings} onSignIn={signIn} onSignOut={signOut} onDemo={startDemo} />

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="account">
          <span className="wordmark">DuperHuman</span>
          <span>·</span>
          <button onClick={() => setOverlay('settings')}>{account.email}</button>
        </span>
      </div>
      <div className="workspace">
        <ThreadList
          split={split}
          counts={counts}
          threads={visibleThreads}
          selected={selected}
          checked={checked}
          loading={loading}
          hasMore={Boolean(splits[split]?.nextPageToken)}
          me={me}
          search={search}
          searchRef={searchRef}
          onSearch={setSearch}
          onSearchSubmit={() => {
            setActiveSearch(search)
            void loadSplit(split, { query: search })
          }}
          onSelectSplit={(target) => run(({ important: 'goImportant', other: 'goOther', starred: 'goStarred', snoozed: 'goSnoozed', sent: 'goSent', drafts: 'goDrafts', done: 'goDone' } as const)[target])}
          onSelect={setSelected}
          onOpen={setSelected}
          onLoadMore={() => void loadSplit(split, { more: true })}
        />
        <div className="pane">
          <ThreadView thread={openThread} loading={threadLoading} me={me} summary={summary} onDismissSummary={() => setSummary(null)} />
          {draft && (
            <Composer draft={draft} sending={sending} aiBusy={aiBusy} onChange={setDraft} onSend={() => void sendDraft()} onDiscard={() => setDraft(null)} onAiDraft={(instruction) => void aiDraft(instruction)} />
          )}
        </div>
      </div>
      {overlay === 'palette' && <CommandPalette items={paletteItems} onClose={() => setOverlay(null)} />}
      {overlay === 'shortcuts' && <Shortcuts onClose={() => setOverlay(null)} />}
      {overlay === 'snooze' && <SnoozeMenu onPick={(until) => void snoozeUntil(until)} onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && (
        <Setup modal settings={settings} signedIn email={account.email} onSave={saveSettings} onSignIn={signIn} onSignOut={signOut} onClose={() => setOverlay(null)} />
      )}
      <Toasts toasts={toasts} onUndo={(entry) => { entry.undo?.(); setToasts((previous) => previous.filter((item) => item.id !== entry.id)) }} />
      <div className="statusline">
        {snoozes.length > 0 && <span>{snoozes.length} snoozed</span>}
        <span><kbd>⌘K</kbd> commands</span>
      </div>
    </div>
  )
}
