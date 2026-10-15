import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScheduledSend, Settings, Snooze } from '@shared/types'

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
}

interface Persisted {
  settings: Settings
  accounts: Tokens[]
  active: string
  snoozes: Snooze[]
  scheduled: ScheduledSend[]
}

const DEFAULTS: Persisted = {
  settings: { googleClientId: '', googleClientSecret: '', anthropicApiKey: '', aiModel: '', aiProvider: 'anthropic', aiBaseUrl: '', openaiApiKey: '', aiPersona: '', signature: '', theme: 'light', undoSendSeconds: 10, remindWeekdaysOnly: false, readStatusHost: '', readStatusEnabled: false, autoAdvance: 'older', instantReplies: true, autoSummarize: true },
  accounts: [],
  active: '',
  snoozes: [],
  scheduled: [],
}

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'duperhuman.store')
}

function encrypt(text: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(text)
  return Buffer.from(text, 'utf8')
}

function decrypt(buffer: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buffer)
    } catch {
      return buffer.toString('utf8')
    }
  }
  return buffer.toString('utf8')
}

export class Store {
  private state: Persisted

  constructor() {
    this.state = this.load()
  }

  private load(): Persisted {
    const path = filePath()
    if (!existsSync(path)) return structuredClone(DEFAULTS)
    try {
      const parsed = JSON.parse(decrypt(readFileSync(path))) as Partial<Persisted>
      const legacy = parsed as { tokens?: Tokens | null }
      return {
        settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
        accounts: parsed.accounts ?? (legacy.tokens ? [legacy.tokens] : []),
        active: parsed.active ?? legacy.tokens?.email ?? '',
        snoozes: parsed.snoozes ?? [],
        scheduled: parsed.scheduled ?? [],
      }
    } catch (error) {
      console.error('[store] could not read store, starting fresh', error)
      return structuredClone(DEFAULTS)
    }
  }

  private save(): void {
    writeFileSync(filePath(), encrypt(JSON.stringify(this.state)))
  }

  get settings(): Settings {
    return { ...this.state.settings }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.state.settings = { ...this.state.settings, ...patch }
    this.save()
    return this.settings
  }

  /** Tokens of the active account. */
  get tokens(): Tokens | null {
    const found = this.state.accounts.find((entry) => entry.email === this.state.active) ?? this.state.accounts[0]
    return found ? { ...found } : null
  }

  get accounts(): Tokens[] {
    return this.state.accounts.map((entry) => ({ ...entry }))
  }

  tokensFor(email: string): Tokens | null {
    const found = this.state.accounts.find((entry) => entry.email === email)
    return found ? { ...found } : null
  }

  /** Insert or update an account's tokens. Pass `activate` to make it the active account. */
  upsertTokens(tokens: Tokens, activate = false): void {
    const others = this.state.accounts.filter((entry) => entry.email !== tokens.email)
    this.state.accounts = [...others, tokens].sort((a, b) => this.state.accounts.findIndex((x) => x.email === a.email) - this.state.accounts.findIndex((x) => x.email === b.email))
    if (activate || !this.state.active) this.state.active = tokens.email
    this.save()
  }

  removeAccount(email: string): void {
    this.state.accounts = this.state.accounts.filter((entry) => entry.email !== email)
    if (this.state.active === email) this.state.active = this.state.accounts[0]?.email ?? ''
    this.save()
  }

  setActive(email: string): void {
    if (this.state.accounts.some((entry) => entry.email === email)) {
      this.state.active = email
      this.save()
    }
  }

  get snoozes(): Snooze[] {
    return [...this.state.snoozes]
  }

  setSnoozes(snoozes: Snooze[]): void {
    this.state.snoozes = snoozes
    this.save()
  }

  get scheduled(): ScheduledSend[] {
    return [...this.state.scheduled]
  }

  setScheduled(items: ScheduledSend[]): void {
    this.state.scheduled = items
    this.save()
  }
}
