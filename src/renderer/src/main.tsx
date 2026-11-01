import { render } from 'preact'
import { App } from './ui/App'
import { controller } from './controller'
import './styles.css'

render(<App />, document.getElementById('app') as HTMLElement)

// Em desenvolvimento, expõe o controller para inspeção pelo DevTools.
if (import.meta.env.DEV) (window as unknown as { __pb: typeof controller }).__pb = controller

// ------------------------------------------------------------ click-through
// A janela deixa o clique passar, exceto sobre elementos marcados com data-hit (HUD, painel)
// ou sobre algo interativo no canvas.
let interactive = false
function setInteractive(next: boolean): void {
  if (next === interactive) return
  interactive = next
  window.pokebar.setInteractive(next)
}

function updateHover(x: number, y: number): void {
  const el = document.elementFromPoint(x, y)
  if (el?.closest('[data-hit]')) return setInteractive(true)
  if (el instanceof HTMLCanvasElement) {
    const r = el.getBoundingClientRect()
    return setInteractive(controller.scene.hitTest(x - r.left, y - r.top))
  }
  setInteractive(false)
}

window.pokebar.onCursor((p) => (p ? updateHover(p.x, p.y) : setInteractive(false)))
window.addEventListener('mousemove', (e) => updateHover(e.clientX, e.clientY))
