import { contextBridge, ipcRenderer } from 'electron'

export type CursorPoint = { x: number; y: number } | null
export interface Layout {
  panelOpen: boolean
  widthPct: number
  align: 'left' | 'center' | 'right'
  displayId: number | null
}

const api = {
  /** true = a janela recebe o mouse; false = clique passa para a janela de baixo. */
  setInteractive(interactive: boolean): void {
    ipcRenderer.send('pokebar:set-interactive', interactive)
  },
  /** Posição do cursor relativa à janela (null quando sai dela). */
  onCursor(cb: (p: CursorPoint) => void): void {
    ipcRenderer.on('pokebar:cursor', (_e, p: CursorPoint) => cb(p))
  },
  setLayout(layout: Layout): void {
    ipcRenderer.send('pokebar:layout', layout)
  },
  displays(): Promise<{ id: number; label: string }[]> {
    return ipcRenderer.invoke('pokebar:displays')
  },
  load(): Promise<string | null> {
    return ipcRenderer.invoke('pokebar:load')
  },
  save(json: string): Promise<void> {
    return ipcRenderer.invoke('pokebar:save', json)
  },
  /** O app vai fechar: salve e chame saved(). */
  onSaveNow(cb: () => void): void {
    ipcRenderer.on('pokebar:save-now', () => cb())
  },
  saved(): void {
    ipcRenderer.send('pokebar:saved')
  },
  onOpenPanel(cb: () => void): void {
    ipcRenderer.on('pokebar:open-panel', () => cb())
  },
  setLoginItem(enabled: boolean): void {
    ipcRenderer.send('pokebar:login-item', enabled)
  },
  openSaveFolder(): void {
    ipcRenderer.send('pokebar:open-save-folder')
  },
  quit(): void {
    ipcRenderer.send('pokebar:quit')
  },
  log(msg: string): void {
    ipcRenderer.send('pokebar:log', msg)
  }
}

export type PokebarApi = typeof api

contextBridge.exposeInMainWorld('pokebar', api)
