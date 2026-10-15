import type { BrowserWindow } from 'electron'
import { base64Url, buildRawMessage } from '@shared/mime'
import { dueSends } from '@shared/schedule'
import type { ScheduledSend } from '@shared/types'
import type { Gmail } from './gmail'
import type { Snoozes } from './snooze'
import type { Store } from './store'

/**
 * Send later and undo send share one queue: undo send is a scheduled send a few
 * seconds out. Items persist, so a send survives a restart.
 */
export class Scheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private sending = new Set<string>()

  constructor(
    private readonly store: Store,
    private readonly gmail: Gmail,
    private readonly snoozes: Snoozes,
    private readonly from: () => string,
    private readonly window: () => BrowserWindow | null,
  ) {}

  start(): void {
    this.arm()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  list(): ScheduledSend[] {
    return this.store.scheduled.sort((a, b) => a.sendAt - b.sendAt)
  }

  add(item: ScheduledSend): ScheduledSend[] {
    this.store.setScheduled([...this.store.scheduled.filter((entry) => entry.id !== item.id), item])
    this.arm()
    return this.list()
  }

  cancel(id: string): ScheduledSend | null {
    if (this.sending.has(id)) return null
    const item = this.store.scheduled.find((entry) => entry.id === id) ?? null
    if (item) this.store.setScheduled(this.store.scheduled.filter((entry) => entry.id !== id))
    this.arm()
    return item
  }

  async sendNow(id: string): Promise<ScheduledSend[]> {
    const item = this.store.scheduled.find((entry) => entry.id === id)
    if (item) await this.deliver(item)
    return this.list()
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer)
    const next = this.list()[0]
    if (!next) return
    // Re-check at least every minute so sleep/wake drift cannot strand an item.
    const delay = Math.min(Math.max(next.sendAt - Date.now(), 0), 60_000)
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  private async flush(): Promise<void> {
    const { due } = dueSends(this.store.scheduled, Date.now())
    for (const item of due) await this.deliver(item)
    this.arm()
  }

  private async deliver(item: ScheduledSend): Promise<void> {
    if (this.sending.has(item.id)) return
    this.sending.add(item.id)
    try {
      const raw = base64Url(buildRawMessage(item.mail, this.from()))
      const result = await this.gmail.request<{ id: string; threadId: string }>('messages/send', {
        method: 'POST',
        body: { raw, threadId: item.mail.threadId },
      })
      this.store.setScheduled(this.store.scheduled.filter((entry) => entry.id !== item.id))
      if (item.remindIfNoReplyAt) {
        await this.snoozes.add({ threadId: result.threadId, until: item.remindIfNoReplyAt, subject: item.mail.subject, ifNoReply: true, setAt: Date.now() })
      }
      this.window()?.webContents.send('schedule:sent', item, { threadId: result.threadId })
    } catch (error) {
      // Leave it queued but push it back a minute so a bad item cannot spin.
      this.store.setScheduled(this.store.scheduled.map((entry) => (entry.id === item.id ? { ...entry, sendAt: Date.now() + 60_000 } : entry)))
      this.window()?.webContents.send('schedule:sent', item, { error: error instanceof Error ? error.message : String(error) })
    } finally {
      this.sending.delete(item.id)
    }
  }
}
