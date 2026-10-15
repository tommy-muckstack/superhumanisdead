import { contextBridge, ipcRenderer } from 'electron'
import type { AiRequest, DuperApi, ScheduledSend, Settings, Snooze, ThreadSummary } from '@shared/types'

let streamCounter = 0

const api: DuperApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:set', patch),
  },
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    signIn: () => ipcRenderer.invoke('auth:signIn'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
  },
  gmail: {
    request: (path, init) => ipcRenderer.invoke('gmail:request', path, init),
  },
  snooze: {
    list: () => ipcRenderer.invoke('snooze:list'),
    add: (snooze: Snooze) => ipcRenderer.invoke('snooze:add', snooze),
    remove: (threadId: string) => ipcRenderer.invoke('snooze:remove', threadId),
    onWake: (handler) => {
      const listener = (_event: unknown, snooze: Snooze): void => handler(snooze)
      ipcRenderer.on('snooze:wake', listener)
      return () => ipcRenderer.removeListener('snooze:wake', listener)
    },
  },
  ai: {
    complete: (request: AiRequest) => ipcRenderer.invoke('ai:complete', request),
    stream: async (request: AiRequest, onChunk) => {
      const id = `stream-${++streamCounter}`
      const listener = (_event: unknown, streamId: string, text: string): void => {
        if (streamId === id) onChunk(text)
      }
      ipcRenderer.on('ai:chunk', listener)
      try {
        return await ipcRenderer.invoke('ai:stream', id, request)
      } finally {
        ipcRenderer.removeListener('ai:chunk', listener)
      }
    },
    triage: (threads: ThreadSummary[], me: string) => ipcRenderer.invoke('ai:triage', threads, me),
  },
  schedule: {
    list: () => ipcRenderer.invoke('schedule:list'),
    add: (item: ScheduledSend) => ipcRenderer.invoke('schedule:add', item),
    cancel: (id: string) => ipcRenderer.invoke('schedule:cancel', id),
    sendNow: (id: string) => ipcRenderer.invoke('schedule:sendNow', id),
    onSent: (handler) => {
      const listener = (_event: unknown, item: ScheduledSend, result: { threadId: string } | { error: string }): void => handler(item, result)
      ipcRenderer.on('schedule:sent', listener)
      return () => ipcRenderer.removeListener('schedule:sent', listener)
    },
  },
  calendar: {
    events: (from: number, to: number) => ipcRenderer.invoke('calendar:events', from, to),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
}

contextBridge.exposeInMainWorld('duper', api)
