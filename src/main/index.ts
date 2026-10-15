import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { join } from 'node:path'
import { Store } from './store'
import { GoogleAuth } from './google-auth'
import { Gmail, type GmailInit } from './gmail'
import { Assistant } from './assistant'
import { Snoozes } from './snooze'
import { Scheduler } from './scheduler'
import { createEvent, listEvents } from './calendar'
import type { AiRequest, NewEvent, OutgoingAttachment, ScheduledSend, Settings, Snooze, ThreadSummary } from '@shared/types'

const store = new Store()
const auth = new GoogleAuth(store)
const gmail = new Gmail(auth)
const claude = new Assistant(store)
let mainWindow: BrowserWindow | null = null
const snoozes = new Snoozes(store, gmail, () => mainWindow, () => auth.email)
const scheduler = new Scheduler(store, gmail, snoozes, () => auth.email, () => mainWindow)

function createWindow(): void {
  nativeTheme.themeSource = store.settings.theme === 'dark' ? 'dark' : store.settings.theme === 'light' ? 'light' : 'system'
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: store.settings.theme === 'dark' ? '#282828' : '#FFFFFF',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file:')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => store.settings)
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => store.updateSettings(patch))

  const status = () => ({ email: auth.email, signedIn: auth.signedIn, all: auth.emails })
  ipcMain.handle('auth:status', status)
  ipcMain.handle('auth:switchTo', (_event, email: string) => {
    auth.switchTo(email)
    return status()
  })
  ipcMain.handle('auth:signIn', async () => {
    const tokens = await auth.signIn()
    snoozes.start()
    scheduler.start()
    return { ...status(), email: tokens.email, signedIn: true }
  })
  ipcMain.handle('auth:signOut', async () => {
    await auth.signOut()
    if (!auth.signedIn) {
      snoozes.stop()
      scheduler.stop()
    }
    return status()
  })

  ipcMain.handle('gmail:request', (_event, path: string, init?: GmailInit) => gmail.request(path, init))

  ipcMain.handle('snooze:list', () => snoozes.list())
  ipcMain.handle('snooze:add', (_event, snooze: Snooze) => snoozes.add(snooze))
  ipcMain.handle('snooze:remove', (_event, threadId: string) => snoozes.remove(threadId))

  ipcMain.handle('schedule:list', () => scheduler.list())
  ipcMain.handle('schedule:add', (_event, item: ScheduledSend) => scheduler.add(item))
  ipcMain.handle('schedule:cancel', (_event, id: string) => scheduler.cancel(id))
  ipcMain.handle('schedule:sendNow', (_event, id: string) => scheduler.sendNow(id))
  ipcMain.handle('calendar:events', (_event, from: number, to: number) => listEvents(auth, from, to))

  ipcMain.handle('calendar:create', (_event, event: NewEvent) => createEvent(auth, event))

  ipcMain.handle('gmail:attachment', async (_event, messageId: string, attachmentId: string) => {
    const part = await gmail.request<{ data: string }>(`messages/${messageId}/attachments/${attachmentId}`)
    return part.data.replace(/-/g, '+').replace(/_/g, '/')
  })

  const MAX_ATTACH_BYTES = 25 * 1024 * 1024
  ipcMain.handle('files:pick', async (): Promise<OutgoingAttachment[]> => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, { properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    let total = 0
    return result.filePaths.map((path) => {
      const size = statSync(path).size
      total += size
      if (total > MAX_ATTACH_BYTES) throw new Error('Gmail limits a message to 25 MB of attachments.')
      return { filename: basename(path), mimeType: mimeFor(path), data: readFileSync(path).toString('base64'), size }
    })
  })
  ipcMain.handle('files:save', async (_event, filename: string, base64: string) => {
    const result = await dialog.showSaveDialog(mainWindow ?? undefined!, { defaultPath: basename(filename) })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, Buffer.from(base64, 'base64'))
    return result.filePath
  })

  ipcMain.handle('print', async (_event, html: string) => {
    // Render in a throwaway, script-less window so message HTML cannot run code.
    const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await new Promise<void>((resolve) => win.webContents.print({ silent: false }, () => resolve()))
    } finally {
      win.destroy()
    }
  })

  ipcMain.handle('readStatus:fetch', async (_event, tokens: string[]) => {
    const { readStatusEnabled, readStatusHost } = store.settings
    if (!readStatusEnabled || !readStatusHost || !tokens.length) return {}
    const url = new URL('/opens', readStatusHost)
    url.searchParams.set('tokens', tokens.slice(0, 100).join(','))
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Read status host: ${response.status}`)
    return (await response.json()) as Record<string, { at: number; userAgent?: string }[]>
  })

  ipcMain.handle('ai:complete', (_event, request: AiRequest) => claude.complete(request))
  ipcMain.handle('ai:stream', (event, id: string, request: AiRequest) =>
    claude.stream(request, (text) => event.sender.send('ai:chunk', id, text)),
  )
  ipcMain.handle('ai:triage', (_event, threads: ThreadSummary[], me: string) => claude.triage(threads, me))

  ipcMain.handle('shell:post', async (_event, url: string, body: string) => {
    if (!/^https:\/\//.test(url)) throw new Error('Only https links can be used to unsubscribe.')
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' })
    return response.status
  })

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (!/^https?:\/\//.test(url)) return
    return shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  if (auth.signedIn) {
    snoozes.start()
    scheduler.start()
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const types: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', json: 'application/json', ics: 'text/calendar' }
  return types[ext] ?? 'application/octet-stream'
}
