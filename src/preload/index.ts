import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, ConfirmCommand, ConfirmPayload, SoundName } from '../shared/api'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  getState: () => ipcRenderer.invoke('state:get'),
  startSession: () => ipcRenderer.invoke('session:start'),
  endSession: () => ipcRenderer.invoke('session:end'),
  capture: () => ipcRenderer.invoke('capture'),
  importImage: () => ipcRenderer.invoke('import'),
  editMatch: (id) => ipcRenderer.invoke('match:edit', id),
  deleteMatch: (id) => ipcRenderer.invoke('match:delete', id),
  setTeamTracked: (key, tracked) => ipcRenderer.invoke('team:track', key, tracked),
  openDataDir: () => ipcRenderer.invoke('data:open'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onStateChanged: (cb) => subscribe('state:changed', cb),
  onSound: (cb) => subscribe<SoundName>('sound', cb),
  playSound: (sound) => ipcRenderer.send('sound:play', sound),
  onConfirmPayload: (cb) => subscribe<ConfirmPayload>('confirm:payload', cb),
  onConfirmCommand: (cb) => subscribe<ConfirmCommand>('confirm:command', cb),
  confirmReady: () => ipcRenderer.send('confirm:ready'),
  saveMatch: (match, editId) => ipcRenderer.invoke('match:save', match, editId),
  closeConfirm: () => ipcRenderer.send('confirm:close')
}

contextBridge.exposeInMainWorld('api', api)
