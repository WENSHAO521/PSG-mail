const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Notifications — invoke (not fire-and-forget) so the renderer can tell
  // whether the OS actually supports/showed it, e.g. for the Settings
  // "send test notification" diagnostic.
  sendNotification: (title, body, emailId) => {
    return ipcRenderer.invoke('notify', { title, body, emailId })
  },
  onNotificationOpenEmail: (cb) => {
    ipcRenderer.removeAllListeners('notification-open-email')
    ipcRenderer.on('notification-open-email', (_, data) => cb(data))
  },

  // Dock badge (macOS) / taskbar overlay badge (Windows)
  setBadgeCount: (count) => {
    ipcRenderer.send('set-badge', count)
  },

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Platform info
  platform: process.platform,
  isMac: process.platform === 'darwin',
  isWin: process.platform === 'win32',

  // Auto-update
  onUpdateAvailable:    (cb) => { ipcRenderer.removeAllListeners('update-available');    ipcRenderer.on('update-available',    (_, info) => cb(info)) },
  onUpdateProgress:     (cb) => { ipcRenderer.removeAllListeners('update-progress');     ipcRenderer.on('update-progress',     (_, pct)  => cb(pct)) },
  onUpdateDownloaded:   (cb) => { ipcRenderer.removeAllListeners('update-downloaded');   ipcRenderer.on('update-downloaded',   ()        => cb()) },
  onUpdateNotAvailable: (cb) => { ipcRenderer.removeAllListeners('update-not-available');ipcRenderer.on('update-not-available',()        => cb()) },
  onUpdateError:        (cb) => { ipcRenderer.removeAllListeners('update-error');        ipcRenderer.on('update-error',        (_, msg)  => cb(msg)) },
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  installUpdate:   () => ipcRenderer.send('install-update'),
})
