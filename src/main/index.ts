import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import trayIconPath from '../../resources/icon.png?asset'

/** Altura da faixa (DIP), colada logo acima da barra de tarefas. */
const STRIP_HEIGHT = 110
/** Altura extra quando o painel de menus está aberto. */
const PANEL_HEIGHT = 470
const TOGGLE_SHORTCUT = 'Control+Alt+P'
const CURSOR_POLL_MS = 33
const BACKUP_EVERY_MS = 10 * 60 * 1000
const BACKUPS = 3

interface Layout {
  panelOpen: boolean
  widthPct: number
  align: 'left' | 'center' | 'right'
  displayId: number | null
}

// Só em desenvolvimento: save separado (%APPDATA%/pokebar-dev) e porta de depuração local
// para inspecionar o renderer (console/print). O jogo empacotado usa %APPDATA%/pokebar.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'pokebar-dev'))
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
}

let strip: BrowserWindow | null = null
let tray: Tray | null = null
let cursorTimer: NodeJS.Timeout | null = null
let cursorInside = false
let layout: Layout = { panelOpen: false, widthPct: 100, align: 'left', displayId: null }
let lastBackup = 0
let quitting = false

const savePath = (): string => join(app.getPath('userData'), 'save.json')
const backupPath = (n: number): string => join(app.getPath('userData'), `save.bak${n}.json`)

function targetDisplay(): Electron.Display {
  const all = screen.getAllDisplays()
  return all.find((d) => d.id === layout.displayId) ?? screen.getPrimaryDisplay()
}

/** Retângulo da faixa (e do painel, quando aberto) na base da área útil do monitor. */
function stripBounds(): Electron.Rectangle {
  const { workArea } = targetDisplay()
  const width = Math.max(480, Math.round((workArea.width * Math.min(100, Math.max(20, layout.widthPct))) / 100))
  const height = STRIP_HEIGHT + (layout.panelOpen ? PANEL_HEIGHT : 0)
  const x =
    layout.align === 'right'
      ? workArea.x + workArea.width - width
      : layout.align === 'center'
        ? workArea.x + Math.round((workArea.width - width) / 2)
        : workArea.x
  return { x, y: workArea.y + workArea.height - height, width, height }
}

function createStrip(): BrowserWindow {
  const win = new BrowserWindow({
    ...stripBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Não rouba o foco do app em que você está trabalhando (só quando o painel abre).
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // O jogo continua rodando coberto ou sem foco.
      backgroundThrottling: false
    }
  })

  // Por padrão o clique passa; o renderer liga a interação só sobre sprites, botões e painel.
  win.setIgnoreMouseEvents(true, { forward: true })
  win.once('ready-to-show', () => win.showInactive())

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** Repassa a posição do cursor ao renderer enquanto ele estiver sobre a janela. */
function startCursorWatch(win: BrowserWindow): void {
  cursorTimer = setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return
    const p = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
    if (inside) {
      win.webContents.send('pokebar:cursor', { x: p.x - b.x, y: p.y - b.y })
      cursorInside = true
    } else if (cursorInside) {
      win.webContents.send('pokebar:cursor', null)
      cursorInside = false
    }
  }, CURSOR_POLL_MS)
}

function applyLayout(): void {
  if (!strip) return
  strip.setBounds(stripBounds())
  strip.setFocusable(layout.panelOpen)
  if (layout.panelOpen) strip.focus()
}

function toggleStrip(): void {
  if (!strip) return
  if (strip.isVisible()) strip.hide()
  else strip.showInactive()
}

function createTray(): Tray {
  const t = new Tray(nativeImage.createFromPath(trayIconPath))
  t.setToolTip('pokebar')
  t.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar/esconder (Ctrl+Alt+P)', click: toggleStrip },
      { label: 'Abrir menu do jogo', click: () => strip?.webContents.send('pokebar:open-panel') },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ])
  )
  t.on('click', toggleStrip)
  return t
}

// ------------------------------------------------------------ save

async function loadSave(): Promise<string | null> {
  for (const p of [savePath(), backupPath(1), backupPath(2), backupPath(3)]) {
    try {
      if (!existsSync(p)) continue
      const txt = await readFile(p, 'utf8')
      JSON.parse(txt)
      return txt
    } catch {
      // arquivo corrompido: tenta o próximo backup
    }
  }
  return null
}

async function writeSave(json: string): Promise<void> {
  const file = savePath()
  if (Date.now() - lastBackup > BACKUP_EVERY_MS && existsSync(file)) {
    for (let n = BACKUPS; n > 1; n--) if (existsSync(backupPath(n - 1))) await copyFile(backupPath(n - 1), backupPath(n))
    await copyFile(file, backupPath(1))
    lastBackup = Date.now()
  }
  const tmp = file + '.tmp'
  await writeFile(tmp, json, 'utf8')
  await rename(tmp, file)
}

// ------------------------------------------------------------ app

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => strip?.showInactive())

  app.whenReady().then(() => {
    app.setAppUserModelId('com.pokebar.app')

    ipcMain.on('pokebar:set-interactive', (event, interactive: boolean) => {
      BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(!interactive, { forward: true })
    })
    ipcMain.on('pokebar:log', (_event, msg: string) => console.log(`[renderer] ${msg}`))
    ipcMain.on('pokebar:layout', (_event, next: Layout) => {
      layout = next
      applyLayout()
    })
    ipcMain.handle('pokebar:displays', () =>
      screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: `Monitor ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? ' — principal' : ''}`
      }))
    )
    ipcMain.handle('pokebar:load', () => loadSave())
    ipcMain.handle('pokebar:save', (_event, json: string) => writeSave(json))
    ipcMain.on('pokebar:login-item', (_event, enabled: boolean) => app.setLoginItemSettings({ openAtLogin: enabled }))
    ipcMain.on('pokebar:open-save-folder', () => shell.openPath(app.getPath('userData')))
    ipcMain.on('pokebar:quit', () => app.quit())

    strip = createStrip()
    startCursorWatch(strip)
    tray = createTray()
    globalShortcut.register(TOGGLE_SHORTCUT, toggleStrip)

    screen.on('display-metrics-changed', applyLayout)
    screen.on('display-added', applyLayout)
    screen.on('display-removed', applyLayout)
  })

  // Pede ao renderer para salvar antes de sair (com limite de tempo).
  app.on('before-quit', (event) => {
    if (quitting || !strip || strip.isDestroyed()) return
    event.preventDefault()
    quitting = true
    const done = (): void => app.quit()
    ipcMain.once('pokebar:saved', done)
    strip.webContents.send('pokebar:save-now')
    setTimeout(done, 2000)
  })

  app.on('will-quit', () => {
    if (cursorTimer) clearInterval(cursorTimer)
    globalShortcut.unregisterAll()
    tray?.destroy()
  })

  app.on('window-all-closed', () => app.quit())
}
