// Raiz: painel (abre para cima) + faixa com o canvas e a HUD.
import { useEffect, useRef, useState } from 'preact/hooks'
import { controller } from '../controller'
import { Hud } from './Hud'
import { StarterView, VIEWS, type ViewKey } from './views'
import { useGame } from './common'

export function App() {
  const c = useGame()
  const [view, setView] = useState<ViewKey | null>(null)
  const [open, setOpen] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current || !stripRef.current) return
    booted.current = true
    void controller.boot(stripRef.current).then(() => {
      if (!controller.state.starterChosen) setOpen(true)
      const off = controller.offline
      if (off) {
        const h = (off.ms / 3_600_000).toFixed(1)
        const lv = off.levelUps.map((l) => `${l.name} ${l.from}→${l.to}`).join(', ')
        controller.toast(`Enquanto você estava fora (${h}h): ${off.battles} lutas, +₽${off.money}${lv ? ` · ${lv}` : ''}`, 'good', 12000)
      }
    })
    window.pokebar.onOpenPanel(() => setOpen(true))
  }, [])

  // Janela cresce para cima quando o painel abre; largura/alinhamento/monitor vêm das opções.
  const s = c.game?.state
  const layoutKey = s ? `${open}|${s.settings.stripWidthPct}|${s.settings.stripAlign}|${s.settings.displayId}` : `${open}`
  useEffect(() => {
    const st = controller.game?.state.settings
    window.pokebar.setLayout({
      panelOpen: open,
      widthPct: st?.stripWidthPct ?? 100,
      align: st?.stripAlign ?? 'left',
      displayId: st?.displayId ?? null
    })
  }, [layoutKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const needStarter = !!s && !s.starterChosen
  const current: ViewKey = view ?? 'team'
  const View = VIEWS[current].C
  return (
    <div class="root">
      <div class={`panel${open ? ' open' : ''}`} data-hit={open ? '' : undefined}>
        {open && (
          <div class="panel-inner" data-hit>
            <div class="tabs">
              {!needStarter &&
                (Object.keys(VIEWS) as ViewKey[]).map((k) => (
                  <button key={k} class={`tab${current === k ? ' on' : ''}`} onClick={() => setView(k)}>
                    {VIEWS[k].label}
                  </button>
                ))}
              <span class="spacer" />
              <button class="tab close-tab" onClick={() => setOpen(false)} title="Fechar (Esc)">
                ✕
              </button>
            </div>
            <div class="panel-body">{needStarter ? <StarterView /> : <View />}</div>
          </div>
        )}
      </div>
      <div class="strip" ref={stripRef}>
        <Hud onMenu={() => setOpen((o) => !o)} />
      </div>
    </div>
  )
}
