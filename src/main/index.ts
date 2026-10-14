import { app, BrowserWindow, ipcMain, shell, nativeTheme } from 'electron'
import { join } from 'node:path'
import { Store } from './store'
import { GoogleAuth } from './google-auth'
import { Gmail, type GmailInit } from './gmail'
import { Claude } from './claude'
import { Snoozes } from './snooze'
import type { AiRequest, Settings, Snooze, ThreadSummary } from '@shared/types'

const store = new Store()
const auth = new GoogleAuth(store)
const gmail = new Gmail(auth)
const claude = new Claude(store)
let mainWindow: BrowserWindow | null = null
const snoozes = new Snoozes(store, gmail, () => mainWindow)

function createWindow(): void {
  nativeTheme.themeSource = 'dark'
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#141518',
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

  ipcMain.handle('auth:status', () => ({ email: auth.email, signedIn: auth.signedIn }))
  ipcMain.handle('auth:signIn', async () => {
    const tokens = await auth.signIn()
    snoozes.start()
    return { email: tokens.email, signedIn: true }
  })
  ipcMain.handle('auth:signOut', async () => {
    snoozes.stop()
    await auth.signOut()
  })

  ipcMain.handle('gmail:request', (_event, path: string, init?: GmailInit) => gmail.request(path, init))

  ipcMain.handle('snooze:list', () => snoozes.list())
  ipcMain.handle('snooze:add', (_event, snooze: Snooze) => snoozes.add(snooze))
  ipcMain.handle('snooze:remove', (_event, threadId: string) => snoozes.remove(threadId))

  ipcMain.handle('ai:complete', (_event, request: AiRequest) => claude.complete(request))
  ipcMain.handle('ai:stream', (event, id: string, request: AiRequest) =>
    claude.stream(request, (text) => event.sender.send('ai:chunk', id, text)),
  )
  ipcMain.handle('ai:triage', (_event, threads: ThreadSummary[], me: string) => claude.triage(threads, me))

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (!/^https?:\/\//.test(url)) return
    return shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  if (auth.signedIn) snoozes.start()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
