import type { BrowserWindow } from 'electron'
import { shouldRemind } from '@shared/schedule'
import type { Snooze } from '@shared/types'
import type { Gmail } from './gmail'
import type { Store } from './store'

const TICK_MS = 30_000

export class Snoozes {
  private timer: ReturnType<typeof setInterval> | null = null
  private waking = false

  constructor(
    private readonly store: Store,
    private readonly gmail: Gmail,
    private readonly window: () => BrowserWindow | null,
    private readonly me: () => string = () => '',
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.wakeDue(), TICK_MS)
    void this.wakeDue()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Reminders for the active account (reminders without an account predate multi-account). */
  list(): Snooze[] {
    const me = this.me()
    return this.store.snoozes.filter((entry) => !entry.account || entry.account === me).sort((a, b) => a.until - b.until)
  }

  async add(snooze: Snooze): Promise<Snooze[]> {
    snooze = { ...snooze, account: snooze.account ?? this.me() }
    await this.gmail.request(`threads/${snooze.threadId}/modify`, {
      method: 'POST',
      account: snooze.account,
      body: { removeLabelIds: ['INBOX'] },
    })
    const others = this.store.snoozes.filter((entry) => entry.threadId !== snooze.threadId)
    this.store.setSnoozes([...others, snooze])
    return this.list()
  }

  async remove(threadId: string): Promise<Snooze[]> {
    this.store.setSnoozes(this.store.snoozes.filter((entry) => entry.threadId !== threadId))
    await this.gmail.request(`threads/${threadId}/modify`, {
      method: 'POST',
      body: { addLabelIds: ['INBOX'] },
    })
    return this.list()
  }

  private async stillNoReply(snooze: Snooze): Promise<boolean> {
    const thread = await this.gmail.request<{ messages?: { internalDate: string; payload?: { headers?: { name: string; value: string }[] } }[] }>(
      `threads/${snooze.threadId}`,
      { account: snooze.account, query: { format: 'metadata', metadataHeaders: ['From'] } },
    )
    const messages = (thread.messages ?? []).map((message) => {
      const from = message.payload?.headers?.find((header) => header.name.toLowerCase() === 'from')?.value ?? ''
      const email = /<([^>]+)>/.exec(from)?.[1] ?? from
      return { from: { email: email.trim() }, date: Number(message.internalDate) }
    })
    return shouldRemind(snooze.setAt ?? 0, messages, snooze.account ?? this.me())
  }

  private async wakeDue(): Promise<void> {
    if (this.waking) return
    this.waking = true
    try {
      const now = Date.now()
      for (const snooze of this.store.snoozes.filter((entry) => entry.until <= now)) {
        try {
          if (snooze.ifNoReply && snooze.setAt && !(await this.stillNoReply(snooze))) {
            // Someone replied: the reminder is no longer needed.
            this.store.setSnoozes(this.store.snoozes.filter((entry) => entry.threadId !== snooze.threadId))
            continue
          }
          await this.gmail.request(`threads/${snooze.threadId}/modify`, {
            method: 'POST',
            account: snooze.account,
            body: { addLabelIds: ['INBOX', 'UNREAD'] },
          })
          this.store.setSnoozes(this.store.snoozes.filter((entry) => entry.threadId !== snooze.threadId))
          if (!snooze.account || snooze.account === this.me()) this.window()?.webContents.send('snooze:wake', snooze)
        } catch (error) {
          console.error('[snooze] could not wake thread', snooze.threadId, error)
        }
      }
    } finally {
      this.waking = false
    }
  }
}
