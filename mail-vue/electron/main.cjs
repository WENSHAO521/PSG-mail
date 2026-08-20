// If ELECTRON_RUN_AS_NODE=1 is present in the environment, Electron runs as
// plain Node.js and require('electron') never returns the real API.
// Detect it early and re-spawn ourselves without that variable.
if (process.env.ELECTRON_RUN_AS_NODE) {
  const { spawn } = require('child_process')
  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE
  spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env, windowsHide: false })
    .on('close', (code) => process.exit(code || 0))
  return
}

const { app, BrowserWindow, ipcMain, Notification, nativeImage, shell, Menu, Tray, nativeTheme } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

const isDev  = process.env.NODE_ENV === 'development'
const isMac  = process.platform === 'darwin'
const isWin  = process.platform === 'win32'

// Windows: must be set before app.whenReady() for Toast notifications to appear
if (isWin) app.setAppUserModelId('com.psg.mail')

let win
let tray
let appIcon

// ── Single instance lock ──────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
})

// ── Icon ─────────────────────────────────────────────────────
function iconResourcePath(fileName) {
  return isDev
    ? path.join(__dirname, '..', 'build', fileName)
    : path.join(process.resourcesPath, 'build', fileName)
}

function themedIconBase() {
  return nativeTheme.shouldUseDarkColors ? 'desktop-icon' : 'icon'
}

function themedIconPath(extension) {
  return iconResourcePath(`${themedIconBase()}.${extension}`)
}

function getIcon() {
  const iconBase = themedIconBase()
  if (isMac) {
    const pngPath = iconResourcePath(`${iconBase}.png`)
    const png = nativeImage.createFromPath(pngPath)
    if (!png.isEmpty()) return png

    const icnsPath = iconResourcePath('icon.icns')
    const icns = nativeImage.createFromPath(icnsPath)
    if (!icns.isEmpty()) return icns

    const fallbackPngPath = isDev
      ? path.join(__dirname, '..', 'public', 'pwa-512.png')
      : path.join(__dirname, '..', 'dist', 'pwa-512.png')
    return nativeImage.createFromPath(fallbackPngPath)
  }
  if (isWin) {
    const icoPath = themedIconPath('ico')
    const ico = nativeImage.createFromPath(icoPath)
    if (!ico.isEmpty()) return ico

    const pngPath = themedIconPath('png')
    const png = nativeImage.createFromPath(pngPath)
    if (!png.isEmpty()) return png

    return nativeImage.createFromPath(iconResourcePath('icon.ico'))
  }

  const png = nativeImage.createFromPath(themedIconPath('png'))
  return png.isEmpty() ? nativeImage.createFromPath(iconResourcePath('icon.png')) : png
}

function refreshThemeIcons() {
  appIcon = getIcon()
  if (win && !win.isDestroyed()) {
    if (typeof win.setIcon === 'function') win.setIcon(appIcon)
    win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#141418' : '#ffffff')
  }
  if (tray) tray.setImage(appIcon)
  if (isMac && app.dock) app.dock.setIcon(appIcon)
}

// ── macOS Application Menu ────────────────────────────────────
function buildMacMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Message',
          accelerator: 'CmdOrCtrl+N',
          click: () => win?.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'c',bubbles:true}))"),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking' },
            { role: 'stopSpeaking' },
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'PSG Mail Help',
          click: () => shell.openExternal('https://panorama-sg.com'),
        },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

// ── Windows system tray ───────────────────────────────────────
function createTray() {
  if (!isWin) return
  tray = new Tray(appIcon)
  tray.setToolTip('PSG Mail')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open PSG Mail',
      click: () => { win?.show(); win?.focus() },
    },
    {
      label: 'New Message',
      click: () => {
        win?.show()
        win?.focus()
        win?.webContents.executeJavaScript(
          "document.dispatchEvent(new KeyboardEvent('keydown',{key:'c',bubbles:true}))"
        ).catch(() => {})
      },
    },
    { type: 'separator' },
    {
      label: 'Quit PSG Mail',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)

  tray.on('click', () => {
    if (win?.isVisible()) {
      win.focus()
    } else {
      win?.show()
      win?.focus()
    }
  })

  tray.on('double-click', () => {
    win?.show()
    win?.focus()
  })
}

// ── Windows taskbar jump list ─────────────────────────────────
function setWindowsJumpList() {
  if (!isWin) return
  app.setUserTasks([
    {
      program: process.execPath,
      arguments: '',
      iconPath: process.execPath,
      iconIndex: 0,
      title: 'Open PSG Mail',
      description: 'Open PSG Mail',
    },
    {
      program: process.execPath,
      arguments: '--compose',
      iconPath: process.execPath,
      iconIndex: 0,
      title: 'New Message',
      description: 'Compose a new email',
    },
  ])
}

// ── Window ────────────────────────────────────────────────────
function createWindow() {
  appIcon = getIcon()

  const macWindowOptions = isMac ? {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
  } : {}

  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'PSG Mail',
    icon: appIcon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141418' : '#ffffff',
    show: false,
    ...macWindowOptions,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (!isMac) {
    win.setMenuBarVisibility(false)
  } else {
    Menu.setApplicationMenu(buildMacMenu())
  }

  if (isDev) {
    win.loadURL('http://localhost:3001')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    if (isMac && app.dock) app.dock.setIcon(appIcon)
    if (isWin) {
      createTray()
      setWindowsJumpList()
    }
  })

  // Windows: hide to system tray instead of closing
  win.on('close', (event) => {
    if (isWin && !app.isQuitting) {
      event.preventDefault()
      win.hide()
      if (tray && !tray._trayHintShown) {
        tray._trayHintShown = true
        tray.displayBalloon({
          iconType: 'info',
          title: 'PSG Mail',
          content: 'PSG Mail is still running in the system tray.',
        })
      }
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => { win = null })
}

nativeTheme.on('updated', refreshThemeIcons)

// ── Auto-updater ──────────────────────────────────────────────
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-available', (info) => {
  win?.webContents.send('update-available', { version: info.version })
})

autoUpdater.on('download-progress', (progress) => {
  win?.webContents.send('update-progress', Math.round(progress.percent))
})

autoUpdater.on('update-downloaded', () => {
  win?.webContents.send('update-downloaded')
})

autoUpdater.on('update-not-available', () => {
  win?.webContents.send('update-not-available')
})

autoUpdater.on('error', (err) => {
  win?.webContents.send('update-error', err.message)
})

ipcMain.on('install-update', () => {
  app.isQuitting = true
  autoUpdater.quitAndInstall(true, true)
})

ipcMain.on('check-for-updates', () => {
  if (!isDev) autoUpdater.checkForUpdates()
})

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  // Check after 8 s so the window is fully loaded before any dialog appears
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdates(), 8000)
})

app.on('before-quit', () => { app.isQuitting = true })

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC: Native notifications ─────────────────────────────────
// Returns a diagnostic result instead of firing and forgetting, so the
// renderer (Settings → Notifications) can tell "no OS support" apart from
// "shown, but the OS may still be suppressing it" — see the invoke handler
// below and notification-service.js's showMailNotification().
function showNativeNotification(title, body, emailId) {
  if (!Notification.isSupported()) return { supported: false, shown: false }

  const opts = {
    title: title || 'PSG Mail',
    body: body || '',
    silent: false,
  }
  // Windows needs a proper icon path (not nativeImage) for Toast
  if (isWin) {
    opts.icon = themedIconPath('ico')
  } else if (isMac) {
    // macOS: icon from app bundle, no need to set it
  } else {
    opts.icon = themedIconPath('png')
  }

  const n = new Notification(opts)
  n.on('click', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      if (isMac) app.focus({ steal: true })
      win.focus()
      if (emailId) win.webContents.send('notification-open-email', { emailId })
    }
  })
  n.show()
  return { supported: true, shown: true }
}

ipcMain.handle('notify', (_event, { title, body, emailId }) => {
  return showNativeNotification(title, body, emailId)
})

// ── IPC: Badge / taskbar overlay ─────────────────────────────
ipcMain.on('set-badge', (_event, count) => {
  // macOS dock badge
  if (isMac && app.dock) {
    app.dock.setBadge(count > 0 ? String(count) : '')
  }

  // Windows: tray tooltip + taskbar overlay badge drawn via renderer canvas
  if (isWin) {
    if (tray) {
      tray.setToolTip(count > 0 ? `PSG Mail — ${count} unread` : 'PSG Mail')
    }
    if (win) {
      if (count > 0) {
        const label = count > 99 ? '99+' : String(count)
        const fontSize = label.length > 2 ? 7 : 11
        win.webContents.executeJavaScript(`
          (function() {
            const c = document.createElement('canvas')
            c.width = 20; c.height = 20
            const ctx = c.getContext('2d')
            ctx.beginPath()
            ctx.arc(10, 10, 10, 0, Math.PI * 2)
            ctx.fillStyle = '#bc0000'
            ctx.fill()
            ctx.fillStyle = 'white'
            ctx.font = 'bold ${fontSize}px Arial'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('${label}', 10, 10)
            return c.toDataURL('image/png')
          })()
        `).then(dataUrl => {
          if (win) {
            const img = nativeImage.createFromDataURL(dataUrl)
            win.setOverlayIcon(img, `${count} unread messages`)
          }
        }).catch(() => {})
      } else {
        win.setOverlayIcon(null, '')
      }
    }
  }
})

// ── IPC: Window controls ──────────────────────────────────────
ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('window-close',    () => {
  if (isWin) {
    win?.hide()
  } else {
    win?.close()
  }
})
