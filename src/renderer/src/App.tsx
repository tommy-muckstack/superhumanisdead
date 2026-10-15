import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BINDINGS, KeySequencer, composeCommand, type Command } from '@shared/keys'
import { extractLinks, printableThread, type LinkItem } from '@shared/links'
import { moveChange, removeAllLabels, removeCurrentLabel, toggleLabelChange, userLabels, MUTED_LABEL } from '@shared/labels'
import { parseUnsubscribe, type Unsubscribe } from '@shared/unsubscribe'
import { newToken } from '@shared/read-status'
import type { NewEvent } from '@shared/calendar'
import { messageText } from '@shared/gmail-parse'
import { formatAddress, quoteForReply } from '@shared/mime'
import { SPLITS } from '@shared/splits'
import { htmlToText } from '@shared/gmail-parse'
import { draftToMail } from '@shared/compose'
import { parseInstantReplies, parseWritten, type RewriteStyle } from '@shared/ai-prompts'
import type { Snippet } from '@shared/snippets'
import type { Account, Label, OutgoingMail, ScheduledSend, Settings, Snooze, Split, Thread, ThreadSummary } from '@shared/types'
import { Composer, type Draft, type SendMode } from './components/Composer'
import { CommandPalette, Shortcuts, SnippetManager, TimePicker, Toasts, type PaletteItem, type Toast } from './components/Overlays'
import { AskAi } from './components/AskAi'
import { CalendarSidebar, startOfDay } from './components/CalendarSidebar'
import { CalendarWeek } from './components/Calendar'
import { EventForm } from './components/Calendar'
import { ConfirmDialog, LinksPicker, ListPicker, type PickItem } from './components/Pickers'
import { addDemoEvent } from './lib/demo-calendar'
import { bindThread, statusForThread, trackSend } from './lib/readstatus'
import { bumpSnippet, loadSnippets, saveSnippets } from './lib/snippets'
import { Setup } from './components/Setup'
import { ThreadList } from './components/ThreadList'
import { ThreadView } from './components/ThreadView'
import * as gmail from './lib/gmail'
import { DEMO_EMAIL } from './lib/demo'
import { cleanReplySubject, forwardSubject, whenLong, whenSnooze } from './lib/format'

type Overlay = 'palette' | 'shortcuts' | 'snooze' | 'settings' | 'snippetManager' | 'folderMenu' | 'move' | 'label' | 'links' | 'unsubscribe' | 'event' | 'eventEmpty' | 'week' | null
type Side = 'askAi' | 'calendar' | null

const TYPING_OK = new Set<Command>(['palette', 'search', 'draftReply', 'print', 'openLinks', 'askAi'])
const FOLDER_LABEL: Partial<Record<Split, string>> = { important: 'INBOX', other: 'INBOX', starred: 'STARRED', spam: 'SPAM', trash: 'TRASH' }
const GOTO: Record<Split, Command> = { important: 'goImportant', other: 'goOther', starred: 'goStarred', snoozed: 'goSnoozed', sent: 'goSent', drafts: 'goDrafts', done: 'goDone', spam: 'goSpam', trash: 'goTrash', all: 'goAll' }
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

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
  const [pendingDraft, setPendingDraft] = useState<{ mode: Draft['mode']; popped: boolean } | null>(null)
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
  const [side, setSide] = useState<Side>(null)
  const [calDay, setCalDay] = useState(() => startOfDay(Date.now()))
  const [snippets, setSnippets] = useState<Snippet[]>(loadSnippets)
  const [instant, setInstant] = useState<{ threadId: string; replies: string[] } | null>(null)
  const [expandAll, setExpandAll] = useState(0)
  const [scheduledCount, setScheduledCount] = useState(0)
  const [labels, setLabels] = useState<Label[]>([])
  const [viewLabel, setViewLabel] = useState<Label | null>(null)
  const [aliases, setAliases] = useState<gmail.SendAs[]>([])
  const [msgFocus, setMsgFocus] = useState(-1)
  const [expandFocused, setExpandFocused] = useState(0)
  const [calVersion, setCalVersion] = useState(0)
  const [unsub, setUnsub] = useState<{ info: Unsubscribe; from: string } | null>(null)
  const [linkItems, setLinkItems] = useState<LinkItem[]>([])
  const [readText, setReadText] = useState<string | null>(null)
  const mutedRef = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const sequencer = useMemo(() => new KeySequencer(), [])
  const toastId = useRef(0)
  const me = account.email

  const toast = useCallback((text: string, options: { undo?: () => void; error?: boolean; ttl?: number } = {}) => {
    const id = ++toastId.current
    setToasts((previous) => [...previous.slice(-2), { id, text, ...options }])
    setTimeout(() => setToasts((previous) => previous.filter((entry) => entry.id !== id)), options.ttl ?? (options.undo ? 6000 : 3500))
    return id
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((previous) => previous.filter((entry) => entry.id !== id)), [])

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
        const muted = mutedRef.current
        if (muted && (target === 'important' || target === 'other')) {
          // New mail in a muted conversation re-enters the inbox; send it straight back out.
          const returned = page.threads.filter((thread) => thread.labelIds.includes(muted))
          if (returned.length) {
            page.threads = page.threads.filter((thread) => !thread.labelIds.includes(muted))
            returned.forEach((thread) => void gmail.archive(thread.id).catch(() => undefined))
          }
        }
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
    if (!me) return
    gmail.listLabels(me).then(setLabels).catch(() => undefined)
    gmail.listSendAs(me).then(setAliases).catch(() => setAliases([]))
  }, [me])

  useEffect(() => {
    mutedRef.current = labels.find((label) => label.name === MUTED_LABEL)?.id ?? null
  }, [labels])

  useEffect(() => {
    setMsgFocus(-1)
  }, [openThread?.id])

  useEffect(() => {
    if (!openThread || !settings?.readStatusEnabled || !settings.readStatusHost) {
      setReadText(null)
      return
    }
    let cancelled = false
    statusForThread(openThread.id)
      .then((text) => !cancelled && setReadText(text))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [openThread?.id, settings?.readStatusEnabled, settings?.readStatusHost])

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

  // Instant Reply and auto-summary: quiet best-effort calls when an AI key is set.
  useEffect(() => {
    if (!openThread || !settings) return
    const hasKey = Boolean(settings.aiProvider === 'openai' ? settings.openaiApiKey || settings.aiBaseUrl : settings.anthropicApiKey)
    if (!hasKey) return
    let cancelled = false
    const last = openThread.messages[openThread.messages.length - 1]
    if (settings.instantReplies && last && last.from.email !== me) {
      window.duper.ai
        .complete({ kind: 'instantReplies', thread: openThread, me })
        .then((text) => !cancelled && setInstant({ threadId: openThread.id, replies: parseInstantReplies(text) }))
        .catch(() => undefined)
    }
    if (settings.autoSummarize && openThread.messages.length >= 3) {
      window.duper.ai
        .complete({ kind: 'summarize', thread: openThread, me })
        .then((text) => !cancelled && setSummary({ text, loading: false }))
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openThread?.id])

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
    async (until: Date, ifNoReply = false) => {
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
          const next = await window.duper.snooze.add({ threadId: thread.id, until: until.getTime(), subject: thread.subject, ifNoReply, setAt: Date.now() })
          setSnoozes(next)
        }
        setSplits((previous) => ({ ...previous, snoozed: { ...(previous.snoozed ?? EMPTY_SPLIT), loaded: false } }))
        toast(`Remind ${whenSnooze(until.getTime())}${ifNoReply ? ' if no reply' : ''}`, {
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

  const moveWithUndo = useCallback(
    async (action: (id: string) => Promise<void>, reverse: (id: string) => Promise<void>, label: string) => {
      const list = targets()
      if (!list.length) return
      list.forEach((thread) => removeFromLists(thread.id))
      setChecked(new Set())
      try {
        await Promise.all(list.map((thread) => action(thread.id)))
        toast(list.length > 1 ? `${label} ${list.length}` : label, {
          undo: () => {
            list.forEach((thread) => insertInto(split, thread))
            Promise.all(list.map((thread) => reverse(thread.id))).catch(fail)
          },
        })
      } catch (error) {
        list.forEach((thread) => insertInto(split, thread))
        fail(error)
      }
    },
    [targets, removeFromLists, insertInto, split, toast, fail],
  )

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
    (mode: Draft['mode'], popped = false) => {
      const put = (value: Draft) => setDraft(popped ? { ...value, popped: true } : value)
      if (mode === 'new') {
        put({ mode: 'new', to: '', cc: '', bcc: '', subject: '', body: '', quoted: '' })
        return
      }
      if (!openThread || openThread.id !== selectedThread?.id) {
        // The reading pane is still loading the newly selected thread; reply once it lands.
        if (selectedThread) setPendingDraft({ mode, popped })
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
        put({ ...base, mode, to: replyTo.map(formatAddress).join(', '), cc: '', subject: cleanReplySubject(openThread.subject) })
      } else if (mode === 'replyAll') {
        const cc = others([...last.to, ...last.cc]).filter((address) => !replyTo.some((entry) => entry.email === address.email))
        put({ ...base, mode, to: replyTo.map(formatAddress).join(', '), cc: cc.map(formatAddress).join(', '), subject: cleanReplySubject(openThread.subject) })
      } else {
        const header = `---------- Forwarded message ----------\nFrom: ${formatAddress(last.from)}\nDate: ${whenLong(last.date)}\nSubject: ${openThread.subject}\nTo: ${last.to.map(formatAddress).join(', ')}\n\n`
        put({ ...base, mode, to: '', cc: '', subject: forwardSubject(openThread.subject), body: `\n\n${header}${messageText(last)}`, quoted: '', inReplyTo: null, references: null, threadId: undefined })
      }
    },
    [openThread, selectedThread, me],
  )

  useEffect(() => {
    if (pendingDraft && openThread && openThread.id === selectedThread?.id) {
      setPendingDraft(null)
      startDraft(pendingDraft.mode, pendingDraft.popped)
    }
  }, [pendingDraft, openThread, selectedThread?.id, startDraft])

  const afterSend = useCallback(
    (threadId?: string) => {
      if (threadId && openThread?.id === threadId) gmail.getThread(threadId, me).then(setOpenThread).catch(fail)
      setSplits((previous) => ({ ...previous, sent: { ...(previous.sent ?? EMPTY_SPLIT), loaded: false } }))
    },
    [openThread, me, fail],
  )

  useEffect(() => {
    if (!me || window.duperDemo) return
    void window.duper.schedule.list().then((list) => setScheduledCount(list.filter((item) => item.sendAt - item.createdAt > 60_000).length))
    return window.duper.schedule.onSent((item, result) => {
      setScheduledCount((count) => (item.sendAt - item.createdAt > 60_000 ? Math.max(0, count - 1) : count))
      if ('error' in result) toast(`Could not send "${item.mail.subject}": ${result.error}`, { error: true })
      else {
        if (item.mail.trackToken) bindThread(item.mail.trackToken, result.threadId)
        toast(item.sendAt - item.createdAt > 60_000 ? `Sent scheduled: ${item.mail.subject}` : 'Sent')
        afterSend(result.threadId)
      }
    })
  }, [me, toast, afterSend])

  /** Demo inbox has no main-process queue: emulate it with timers. */
  const demoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const sendDraft = useCallback(
    async (mode: SendMode = 'normal') => {
      if (!draft || !me) return
      if (!draft.to.trim()) return
      const saved = draft
      const mail = draftToMail(draft, settings?.signature ?? '')
      const now = Date.now()
      const tracking = Boolean(settings?.readStatusEnabled && settings.readStatusHost)
      if (tracking) mail.trackToken = newToken()
      const undoSeconds = mode === 'now' ? 0 : (settings?.undoSendSeconds ?? 10)
      const scheduled = Boolean(draft.sendAt && draft.sendAt > now)
      const item: ScheduledSend = { id: newId(), mail, createdAt: now, sendAt: scheduled ? (draft.sendAt as number) : now + undoSeconds * 1000, remindIfNoReplyAt: draft.remindAt }
      if (tracking && mail.trackToken) trackSend(mail.trackToken, item.sendAt, draft.threadId)
      setDraft(null)
      if (mode === 'done' && draft.threadId) void markDone()
      const restore = () => setDraft(saved)
      try {
        if (window.duperDemo) {
          const deliver = () => {
            demoTimers.current.delete(item.id)
            void gmail.send(mail, me).then((result) => {
              if (mail.trackToken) bindThread(mail.trackToken, result.threadId)
              toast(scheduled ? `Sent scheduled: ${mail.subject}` : 'Sent')
              afterSend(result.threadId)
            })
          }
          demoTimers.current.set(item.id, setTimeout(deliver, Math.max(0, item.sendAt - now)))
        } else {
          await window.duper.schedule.add(item)
          if (!scheduled && undoSeconds === 0) await window.duper.schedule.sendNow(item.id)
        }
        if (scheduled) setScheduledCount((count) => count + 1)
        if (scheduled || undoSeconds > 0) {
          toast(scheduled ? `Scheduled for ${whenSnooze(item.sendAt)}` : 'Sending…', {
            ttl: scheduled ? 6000 : undoSeconds * 1000,
            undo: () => {
              if (window.duperDemo) {
                const timer = demoTimers.current.get(item.id)
                if (timer) clearTimeout(timer)
                demoTimers.current.delete(item.id)
                if (scheduled) setScheduledCount((count) => Math.max(0, count - 1))
                restore()
                return
              }
              void window.duper.schedule.cancel(item.id).then((cancelled) => {
                if (cancelled) {
                  if (scheduled) setScheduledCount((count) => Math.max(0, count - 1))
                  restore()
                } else toast('Already sent', { error: true })
              })
            },
          })
        }
      } catch (error) {
        restore()
        fail(error)
      }
    },
    [draft, me, settings, toast, fail, afterSend, markDone],
  )

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

  const aiWrite = useCallback(
    async (instruction?: string) => {
      if (!instruction) return
      setAiBusy(true)
      try {
        const text = await window.duper.ai.complete({ kind: 'write', me, instruction })
        const written = parseWritten(text)
        setDraft((previous) => (previous ? { ...previous, subject: previous.subject || written.subject, body: written.body } : previous))
      } catch (error) {
        fail(error)
      } finally {
        setAiBusy(false)
      }
    },
    [me, fail],
  )

  const rewrite = useCallback(
    async (style: RewriteStyle) => {
      if (!draft?.body.trim()) return
      const before = draft.body
      setAiBusy(true)
      try {
        const text = await window.duper.ai.complete({ kind: 'rewrite', me, text: before, style })
        setDraft((previous) => (previous ? { ...previous, body: text.trim() } : previous))
        toast('Rewritten', { undo: () => setDraft((previous) => (previous ? { ...previous, body: before } : previous)) })
      } catch (error) {
        fail(error)
      } finally {
        setAiBusy(false)
      }
    },
    [draft, me, toast, fail],
  )

  const aiDraft = useCallback(
    async (instruction?: string) => {
      if (draft?.mode === 'new' || (!openThread && draft)) return aiWrite(instruction)
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
    [openThread, draft, me, startDraft, fail, aiWrite],
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

  const viewLabelId = viewLabel?.id ?? FOLDER_LABEL[split] ?? null
  const mutedId = useMemo(() => labels.find((label) => label.name === MUTED_LABEL)?.id ?? null, [labels])

  const changeLabels = useCallback(
    (list: ThreadSummary[], change: { add: string[]; remove: string[] }, message: string) => {
      if (!list.length || (!change.add.length && !change.remove.length)) return
      const leaves = viewLabelId ? change.remove.includes(viewLabelId) : false
      const next = (thread: ThreadSummary) => [...new Set(thread.labelIds.filter((id) => !change.remove.includes(id)).concat(change.add))]
      for (const thread of list) {
        if (leaves) removeFromLists(thread.id)
        else patchThread(thread.id, { labelIds: next(thread) })
      }
      setChecked(new Set())
      Promise.all(list.map((thread) => gmail.modifyThread(thread.id, change.add, change.remove)))
        .then(() =>
          toast(list.length > 1 ? `${message} (${list.length})` : message, {
            undo: () => {
              for (const thread of list) {
                if (leaves) insertInto(split, thread)
                else patchThread(thread.id, { labelIds: thread.labelIds })
              }
              Promise.all(list.map((thread) => gmail.modifyThread(thread.id, change.remove, change.add))).catch(fail)
            },
          }),
        )
        .catch((error) => {
          for (const thread of list) {
            if (leaves) insertInto(split, thread)
            else patchThread(thread.id, { labelIds: thread.labelIds })
          }
          fail(error)
        })
    },
    [viewLabelId, removeFromLists, patchThread, insertInto, split, toast, fail],
  )

  const focusedMessageIndex = openThread ? (msgFocus >= 0 ? Math.min(msgFocus, openThread.messages.length - 1) : openThread.messages.length - 1) : -1

  const saveAttachment = useCallback(
    async (messageId: string, attachment: { attachmentId: string; filename: string }) => {
      try {
        const data = await gmail.downloadAttachment(me, messageId, attachment.attachmentId)
        const saved = await window.duper.files.save(attachment.filename, data)
        if (saved) toast(`Saved ${attachment.filename}`)
      } catch (error) {
        fail(error)
      }
    },
    [me, toast, fail],
  )

  const switchAccount = useCallback(
    async (index: number) => {
      const email = account.all?.[index]
      if (!email) return toast(window.duperDemo ? 'The sample inbox has one account' : `No account ${index + 1} yet. Add one from ⌘K.`)
      if (email === account.email) return
      try {
        const status = await window.duper.auth.switchTo(email)
        setSplits({})
        setOpenThread(null)
        setDraft(null)
        setSelected(0)
        setViewLabel(null)
        setSplit('important')
        setLabels([])
        setAccount(status)
        toast(`Switched to ${email}`)
      } catch (error) {
        fail(error)
      }
    },
    [account, toast, fail],
  )

  const unsubscribeTarget = useCallback((): { info: Unsubscribe; from: string } | null => {
    if (!openThread) return null
    for (let index = openThread.messages.length - 1; index >= 0; index -= 1) {
      const message = openThread.messages[index]
      if (!message) continue
      const info = parseUnsubscribe(message.body.listUnsubscribe, message.body.listUnsubscribePost)
      if (info) return { info, from: message.from.name || message.from.email }
    }
    return null
  }, [openThread])

  const doUnsubscribe = useCallback(async () => {
    if (!unsub) return
    const { info } = unsub
    setOverlay(null)
    try {
      if (info.url && info.oneClick) {
        const code = await window.duper.shell.post(info.url, 'List-Unsubscribe=One-Click')
        if (code >= 400) throw new Error(`The sender's server answered ${code}`)
      } else if (info.url) {
        await window.duper.shell.openExternal(info.url)
      } else if (info.mailto && me) {
        // Only reached after the user confirmed the dialog that names this recipient.
        const mail: OutgoingMail = { to: [info.mailto.to], cc: [], bcc: [], subject: info.mailto.subject || 'unsubscribe', text: info.mailto.body || 'unsubscribe' }
        const item: ScheduledSend = { id: newId(), mail, createdAt: Date.now(), sendAt: Date.now() }
        if (window.duperDemo) await gmail.send(mail, me)
        else {
          await window.duper.schedule.add(item)
          await window.duper.schedule.sendNow(item.id)
        }
      }
      toast(`Unsubscribed from ${unsub.from}`)
      void markDone()
    } catch (error) {
      fail(error)
    }
  }, [unsub, me, toast, fail, markDone])

  const run = useCallback(
    (command: Command) => {
      const goto = (target: Split) => {
        setViewLabel(null)
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
        case 'top':
          setSelected(0)
          break
        case 'bottom':
          setSelected(Math.max(visibleThreads.length - 1, 0))
          break
        case 'notDone':
          void moveWithUndo(gmail.unarchive, gmail.archive, 'Moved to inbox')
          break
        case 'trash':
          void moveWithUndo(gmail.trash, gmail.untrash, 'Trashed')
          break
        case 'spam':
          void moveWithUndo(gmail.spam, gmail.unspam, 'Marked as spam')
          break
        case 'extendNext':
        case 'extendPrev':
          if (selectedThread) {
            setChecked((previous) => new Set(previous).add(selectedThread.id))
            setSelected((index) => {
              const next = command === 'extendNext' ? Math.min(index + 1, visibleThreads.length - 1) : Math.max(index - 1, 0)
              const thread = visibleThreads[next]
              if (thread) setChecked((previous) => new Set(previous).add(thread.id))
              return next
            })
          }
          break
        case 'selectAll':
          setChecked(new Set(visibleThreads.map((thread) => thread.id)))
          break
        case 'expandAll':
          setExpandAll((value) => value + 1)
          break
        case 'askAi':
          setSide((value) => (value === 'askAi' ? null : 'askAi'))
          break
        case 'calendar':
          setSide((value) => (value === 'calendar' ? null : 'calendar'))
          break
        case 'calToday':
          if (side === 'calendar') setCalDay(startOfDay(Date.now()))
          break
        case 'calPrev':
        case 'calNext':
          if (side === 'calendar') setCalDay((day) => startOfDay(day + (command === 'calNext' ? 36 : -12) * 3_600_000))
          break
        case 'shareAvailability':
          setSide('calendar')
          toast('Click "Share availability" in the calendar to paste free times')
          break
        case 'snippets':
        case 'goSnippets':
          setOverlay('snippetManager')
          break
        case 'goSpam':
          goto('spam')
          break
        case 'goTrash':
          goto('trash')
          break
        case 'goAll':
          goto('all')
          break
        case 'triage':
          void triage()
          break
        case 'theme':
          void window.duper.settings.set({ theme: settings?.theme === 'dark' ? 'light' : 'dark' }).then(setSettings)
          break
        case 'back':
          if (side) setSide(null)
          else if (draft) setDraft(null)
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
        case 'nextMessage':
        case 'prevMessage':
          if (openThread) {
            const base = focusedMessageIndex
            setMsgFocus(Math.max(0, Math.min(openThread.messages.length - 1, base + (command === 'nextMessage' ? 1 : -1))))
          }
          break
        case 'expandMessage':
          if (openThread) {
            setMsgFocus(focusedMessageIndex)
            setExpandFocused((value) => value + 1)
          }
          break
        case 'pageDown':
        case 'pageUp': {
          const area = (document.querySelector(openThread ? '.pane-scroll, .thread-scroll' : '.rows') as HTMLElement | null) ?? document.querySelector('.pane')
          area?.scrollBy({ top: (command === 'pageDown' ? 1 : -1) * area.clientHeight * 0.9, behavior: 'smooth' })
          break
        }
        case 'folderMenu':
          setOverlay('folderMenu')
          break
        case 'move':
          if (targets().length) setOverlay('move')
          break
        case 'label':
          if (targets().length) setOverlay('label')
          break
        case 'removeLabel':
        case 'removeLabelNext':
        case 'removeLabelPrev': {
          if (!viewLabelId) {
            toast('Open a folder or label first. Y removes the one you are viewing.')
            break
          }
          const name = viewLabel?.name ?? SPLITS.find((entry) => entry.id === split)?.label ?? 'this folder'
          changeLabels(targets(), removeCurrentLabel(viewLabelId), `Removed from ${name}`)
          if (command === 'removeLabelPrev') setSelected((index) => Math.max(index - 1, 0))
          break
        }
        case 'removeAllLabels':
          for (const thread of targets()) changeLabels([thread], removeAllLabels(thread.labelIds, labels), 'Removed all labels')
          break
        case 'mute':
          void (async () => {
            const list = targets()
            if (!list.length) return
            try {
              const label = await gmail.mutedLabel(me, labels)
              setLabels((previous) => (previous.some((entry) => entry.id === label.id) ? previous : [...previous, label]))
              changeLabels(list, { add: [label.id], remove: ['INBOX'] }, 'Muted. It stays out of your inbox when new mail arrives.')
            } catch (error) {
              fail(error)
            }
          })()
          break
        case 'unsubscribe': {
          const target = unsubscribeTarget()
          if (!target) toast('No unsubscribe link in this conversation')
          else {
            setUnsub(target)
            setOverlay('unsubscribe')
          }
          break
        }
        case 'openLinks':
          if (openThread) {
            const message = openThread.messages[focusedMessageIndex]
            const items = message ? extractLinks(message) : []
            if (!items.length) toast('No links or attachments in this message')
            else {
              setLinkItems(items)
              setOverlay('links')
            }
          }
          break
        case 'print':
          if (openThread) void window.duper.print(printableThread(openThread, (message) => message.body.text ?? htmlToText(message.body.html ?? '')))
          break
        case 'composePop':
          startDraft('new', true)
          break
        case 'replyPop':
          startDraft('reply', true)
          break
        case 'replyAllPop':
          startDraft('replyAll', true)
          break
        case 'forwardPop':
          startDraft('forward', true)
          break
        case 'popSearch':
          if (draft) setDraft({ ...draft, popped: true })
          searchRef.current?.focus()
          break
        case 'account1': case 'account2': case 'account3': case 'account4': case 'account5':
        case 'account6': case 'account7': case 'account8': case 'account9':
          void switchAccount(Number(command.slice(7)) - 1)
          break
        case 'calWeek':
          setOverlay('week')
          break
        case 'createEvent':
          setOverlay('event')
          break
        case 'createEmptyEvent':
          setOverlay('eventEmpty')
          break
        case 'help':
          setOverlay('shortcuts')
          break
        case 'refresh':
          void loadSplit(split)
          break
      }
    },
    [openThread, focusedMessageIndex, viewLabelId, viewLabel, labels, targets, changeLabels, unsubscribeTarget, switchAccount, me, fail, visibleThreads, splits, split, loadSplit, draft, summary, markDone, unsnooze, selectedThread, startDraft, toggleStar, toggleUnread, undo, summarize, aiDraft, moveWithUndo, side, toast, triage, settings],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (overlay) return
      const typing = isTyping(event.target)
      if (typing && !event.metaKey) return
      const onButton = (event.target as HTMLElement | null)?.tagName === 'BUTTON'
      if (onButton && (event.key === ' ' || event.key === 'Enter')) return
      if (!typing && draft) {
        const own = composeCommand(event)
        if (own === 'popToggle') {
          event.preventDefault()
          setDraft({ ...draft, popped: !draft.popped })
          return
        }
        if (own === 'focusToggle') {
          event.preventDefault()
          document.querySelector<HTMLElement>('.composer textarea, .composer [contenteditable]')?.focus()
          return
        }
      }
      const command = sequencer.feed(event)
      if (!command) return
      // Inside a text field only the palette-style chords run; ⌘A, ⌘Z and friends stay with the field.
      if (typing && !TYPING_OK.has(command)) return
      event.preventDefault()
      run(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, sequencer, run, draft])

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const seen = new Set<Command>()
    const commands: PaletteItem[] = []
    for (const binding of BINDINGS) {
      if (binding.scope !== 'global' || binding.command.startsWith('account') || seen.has(binding.command) || ['next', 'prev', 'open', 'palette', 'back'].includes(binding.command)) continue
      seen.add(binding.command)
      const keys = BINDINGS.find((entry) => entry.command === binding.command && entry.keys)?.keys
      commands.push({ id: binding.command, label: binding.label, hint: binding.section, keys, run: () => run(binding.command) })
    }
    return [
      ...commands,
      { id: 'theme', label: 'Toggle dark theme', run: () => run('theme') },
      { id: 'settings', label: 'Settings', hint: account.email, run: () => setOverlay('settings') },
      { id: 'addAccount', label: 'Add another account', run: () => void window.duper.auth.signIn().then((status) => { setSplits({}); setOpenThread(null); setSelected(0); setAccount(status) }).catch(fail) },
      ...(account.all ?? []).filter((email) => email !== account.email).map((email) => ({ id: `switch-${email}`, label: `Switch to ${email}`, hint: 'Accounts', run: () => void switchAccount((account.all ?? []).indexOf(email)) })),
      { id: 'signout', label: 'Sign out', run: () => void signOut() },
    ]
  }, [run, account.email, account.all, switchAccount])

  useEffect(() => {
    const theme = settings?.theme ?? 'light'
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => (document.documentElement.dataset['theme'] = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings?.theme])
  const saveSettings = async (patch: Partial<Settings>) => setSettings(await window.duper.settings.set(patch))
  const signIn = async () => setAccount(await window.duper.auth.signIn())
  const startDemo = () => {
    window.duperDemo = true
    setAccount({ email: DEMO_EMAIL, signedIn: true })
  }
  const signOut = async () => {
    window.duperDemo = false
    const wasDemo = account.email === DEMO_EMAIL
    if (!wasDemo) await window.duper.auth.signOut()
    const status = wasDemo ? { email: '', signedIn: false } : await window.duper.auth.status()
    setAccount(status)
    setSplits({})
    setOpenThread(null)
    setSelected(0)
    setOverlay(null)
  }

  if (!settings) return <div className="setup" />
  if (!account.signedIn) return <Setup settings={settings} signedIn={false} email="" onSave={saveSettings} onSignIn={signIn} onSignOut={signOut} onDemo={startDemo} />

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="account">
          <span className="wordmark">SuperhumanIsDead</span>
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
          onSearchSubmit={(value) => {
            const query = value ?? search
            setActiveSearch(query)
            void loadSplit(split, { query })
          }}
          onSelectSplit={(target) => run(GOTO[target])}
          onSelect={setSelected}
          onOpen={setSelected}
          onLoadMore={() => void loadSplit(split, { more: true })}
        />
        <div className="pane">
          <ThreadView
            thread={openThread}
            loading={threadLoading}
            me={me}
            summary={summary}
            onDismissSummary={() => setSummary(null)}
            expandAll={expandAll}
            focusedIndex={focusedMessageIndex}
            expandFocused={expandFocused}
            readStatus={readText}
            onSaveAttachment={(message, attachment) => void saveAttachment(message.id, attachment)}
            instantReplies={!draft && instant && instant.threadId === openThread?.id ? instant.replies : null}
            onInstantReply={(text) => {
              startDraft('reply')
              setTimeout(() => setDraft((previous) => (previous ? { ...previous, body: text } : previous)))
            }}
          />
          {draft && (
            <Composer
              draft={draft}
              sending={sending}
              aiBusy={aiBusy}
              snippets={snippets}
              me={{ name: '', email: me }}
              weekdaysOnly={settings.remindWeekdaysOnly}
              onChange={setDraft}
              onSend={(mode) => void sendDraft(mode)}
              onDiscard={() => setDraft(null)}
              onAiDraft={(instruction) => void aiDraft(instruction)}
              onRewrite={(style) => void rewrite(style)}
              onSnippetUsed={(snippet) => {
                bumpSnippet(snippet.id)
                setSnippets(loadSnippets())
              }}
              onManageSnippets={() => setOverlay('snippetManager')}
              aliases={aliases}
              onPopToggle={() => setDraft((previous) => (previous ? { ...previous, popped: !previous.popped } : previous))}
              onBlurToThread={() => (document.activeElement as HTMLElement | null)?.blur()}
            />
          )}
        </div>
        {side === 'askAi' && (
          <AskAi
            thread={openThread}
            threads={visibleThreads}
            me={me}
            onClose={() => setSide(null)}
            onOpenThread={(id) => {
              const index = visibleThreads.findIndex((thread) => thread.id === id)
              if (index >= 0) setSelected(index)
            }}
            onUseAsReply={(text) => {
              startDraft('reply')
              setTimeout(() => setDraft((previous) => (previous ? { ...previous, body: text } : previous)))
            }}
          />
        )}
        {side === 'calendar' && (
          <CalendarSidebar
            day={calDay}
            version={calVersion}
            demo={Boolean(window.duperDemo)}
            onClose={() => setSide(null)}
            onShareAvailability={(text) => {
              if (!text) return toast('No free time that day')
              if (draft) setDraft({ ...draft, body: `${draft.body}${draft.body ? '\n\n' : ''}Here are some times that work for me:\n${text}` })
              else {
                void navigator.clipboard.writeText(text)
                toast('Free times copied')
              }
            }}
          />
        )}
      </div>
      {overlay === 'palette' && <CommandPalette items={paletteItems} onClose={() => setOverlay(null)} />}
      {overlay === 'shortcuts' && <Shortcuts onClose={() => setOverlay(null)} />}
      {overlay === 'snooze' && <TimePicker kind="remind" weekdaysOnly={settings.remindWeekdaysOnly} onPick={(choice) => void snoozeUntil(choice.at, choice.ifNoReply)} onClose={() => setOverlay(null)} />}
      {overlay === 'snippetManager' && (
        <SnippetManager
          snippets={snippets}
          onSave={(list) => {
            saveSnippets(list)
            setSnippets(list)
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'folderMenu' && (
        <ListPicker
          title="Go to folder or label"
          items={[
            ...SPLITS.map((entry) => ({ id: `split:${entry.id}`, label: entry.label, hint: entry.hint || undefined })),
            ...userLabels(labels).map((label) => ({ id: `label:${label.id}`, label: label.name, hint: 'Label' })),
          ]}
          onClose={() => setOverlay(null)}
          onPick={(item) => {
            setOverlay(null)
            if (item.id.startsWith('split:')) return run(GOTO[item.id.slice(6) as Split])
            const label = labels.find((entry) => `label:${entry.id}` === item.id)
            if (!label) return
            const query = `label:"${label.name}"`
            setViewLabel(label)
            setSearch(query)
            setActiveSearch(query)
            setSplit('all')
            setSelected(0)
            void loadSplit('all', { query })
          }}
        />
      )}
      {overlay === 'move' && (
        <ListPicker
          title="Move to"
          items={[{ id: 'INBOX', label: 'Inbox' }, ...userLabels(labels).map((label) => ({ id: label.id, label: label.name }))]}
          onClose={() => setOverlay(null)}
          createLabel="Create label"
          onCreate={(name) => {
            setOverlay(null)
            void gmail.createLabel(me, name).then((label) => {
              setLabels((previous) => [...previous, label])
              changeLabels(targets(), moveChange(label.id), `Moved to ${label.name}`)
            }).catch(fail)
          }}
          onPick={(item) => {
            setOverlay(null)
            changeLabels(targets(), moveChange(item.id), `Moved to ${item.label}`)
          }}
        />
      )}
      {overlay === 'label' && (
        <ListPicker
          title="Add or remove label"
          items={userLabels(labels).map((label) => ({ id: label.id, label: label.name, checked: targets().length > 0 && targets().every((thread) => thread.labelIds.includes(label.id)) }))}
          onClose={() => setOverlay(null)}
          createLabel="Create label"
          onCreate={(name) => {
            setOverlay(null)
            void gmail.createLabel(me, name).then((label) => {
              setLabels((previous) => [...previous, label])
              changeLabels(targets(), { add: [label.id], remove: [] }, `Added ${label.name}`)
            }).catch(fail)
          }}
          onPick={(item) => {
            setOverlay(null)
            const list = targets()
            const change = toggleLabelChange(list.map((thread) => thread.labelIds), item.id)
            changeLabels(list, change, change.add.length ? `Added ${item.label}` : `Removed ${item.label}`)
          }}
        />
      )}
      {overlay === 'links' && (
        <LinksPicker
          items={linkItems}
          onClose={() => setOverlay(null)}
          onOpen={(item) => {
            setOverlay(null)
            if (item.kind === 'link' && item.url) void window.duper.shell.openExternal(item.url)
            else if (item.attachmentId && item.messageId) void saveAttachment(item.messageId, { attachmentId: item.attachmentId, filename: item.filename ?? 'attachment' })
          }}
        />
      )}
      {overlay === 'unsubscribe' && unsub && (
        <ConfirmDialog
          title={`Unsubscribe from ${unsub.from}?`}
          body={
            unsub.info.mailto && !unsub.info.url
              ? `This sends a short unsubscribe email to ${unsub.info.mailto.to} from your account.`
              : unsub.info.oneClick
                ? 'The sender supports one-click unsubscribe. Nothing is emailed from your account.'
                : 'This opens the sender’s unsubscribe page in your browser.'
          }
          confirm="Unsubscribe"
          onConfirm={() => void doUnsubscribe()}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'week' && <CalendarWeek anchor={calDay} demo={Boolean(window.duperDemo)} version={calVersion} onNavigate={setCalDay} onCreate={() => setOverlay('event')} onClose={() => setOverlay(null)} />}
      {(overlay === 'event' || overlay === 'eventEmpty') && (
        <EventForm
          empty={overlay === 'eventEmpty'}
          onClose={() => setOverlay(null)}
          onCreate={async (event: NewEvent) => {
            if (window.duperDemo) addDemoEvent(event)
            else await window.duper.calendar.create(event)
            setCalVersion((value) => value + 1)
            setOverlay(null)
            toast(event.attendees.length ? `Created “${event.title}” and invited ${event.attendees.length}` : `Created “${event.title}”`)
          }}
        />
      )}
      {overlay === 'settings' && (
        <Setup modal settings={settings} signedIn email={account.email} onSave={saveSettings} onSignIn={signIn} onSignOut={signOut} onClose={() => setOverlay(null)} />
      )}
      <Toasts toasts={toasts} onUndo={(entry) => { entry.undo?.(); dismissToast(entry.id) }} />
      <div className="statusline">
        {snoozes.length > 0 && <span>{snoozes.length} reminders</span>}
        {scheduledCount > 0 && <span>{scheduledCount} scheduled</span>}
        <span><kbd>0</kbd> calendar</span>
        <span><kbd>?</kbd> ask AI</span>
        <span><kbd>⌘K</kbd> commands</span>
      </div>
    </div>
  )
}
