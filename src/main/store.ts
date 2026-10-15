import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, Snooze } from '@shared/types'

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
}

interface Persisted {
  settings: Settings
  tokens: Tokens | null
  snoozes: Snooze[]
}

const DEFAULTS: Persisted = {
  settings: { googleClientId: '', googleClientSecret: '', anthropicApiKey: '', aiModel: '', aiProvider: 'anthropic', aiBaseUrl: '', openaiApiKey: '', aiPersona: '', signature: '', theme: 'light', undoSendSeconds: 10, remindWeekdaysOnly: false, readStatusHost: '', autoAdvance: 'older', instantReplies: true, autoSummarize: true },
  tokens: null,
  snoozes: [],
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
      return {
        settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
        tokens: parsed.tokens ?? null,
        snoozes: parsed.snoozes ?? [],
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

  get tokens(): Tokens | null {
    return this.state.tokens ? { ...this.state.tokens } : null
  }

  setTokens(tokens: Tokens | null): void {
    this.state.tokens = tokens
    this.save()
  }

  get snoozes(): Snooze[] {
    return [...this.state.snoozes]
  }

  setSnoozes(snoozes: Snooze[]): void {
    this.state.snoozes = snoozes
    this.save()
  }
}
