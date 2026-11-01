// HUD da faixa: zona, dinheiro, bolas, Pokédex, time, cartões de HP, log, avisos e botão Capturar.
import { BALLS } from '../../../shared/items'
import { maxHp } from '../../../shared/mon'
import { currentZone, dexCounts, zoneProgress } from '../../../shared/state'
import { STATUS_TAG, type Card } from '../controller'
import { LAYOUT } from '../scene'
import { Bar, money, useGame } from './common'

function HpCard({ card, left }: { card: Card; left: number }) {
  return (
    <div class="card" style={{ left: `${left}px` }}>
      <div class="card-top">
        <span class="card-name">
          {card.shiny ? '✨' : ''}
          {card.name}
        </span>
        <span class="card-lv">Nv.{card.level}</span>
      </div>
      <Bar value={card.hp} max={card.maxHp} />
      <div class="card-bottom">
        {card.status !== 'none' ? <span class={`st st-${card.status}`}>{STATUS_TAG[card.status]}</span> : <span />}
        <span>
          {card.hp}/{card.maxHp}
        </span>
      </div>
    </div>
  )
}

export function Hud({ onMenu }: { onMenu: () => void }) {
  const c = useGame()
  if (!c.game) return null
  const s = c.state
  const zone = currentZone(s)
  const prog = zoneProgress(s, zone.id)
  const balls = BALLS.reduce((a, b) => a + (s.items[b] ?? 0), 0)
  const dex = dexCounts(s)
  const lines = c.log.slice(-2)
  return (
    <div class="hud">
      <div class="hud-left" data-hit>
        <div class="hud-row">
          <button class="menu-btn" onClick={onMenu} title="Abrir menu">
            <span class="ball-icon" />
          </button>
          <div class="zone">
            <div class="zone-name" title={zone.name}>
              {zone.name}
            </div>
            <div class="zone-prog">
              {zone.kind === 'route' ? `${Math.min(prog.wins, zone.wins)}/${zone.wins} vitórias${prog.cleared ? ' ✓' : ''}` : 'Batalha de líder'}
              {' · '}
              {s.badges.length} 🏅
            </div>
          </div>
        </div>
        <div class="hud-row small">
          <span title="Dinheiro">{money(s.money)}</span>
          <span title="Poké Balls (todas)">◓ {balls}</span>
          <span title="Pokédex: capturados">📕 {dex.caught}/251</span>
        </div>
        <div class="party-pills">
          {s.party.map((m) => {
            const pct = (m.hp / maxHp(m)) * 100
            return <span key={m.uid} class="pill" style={{ background: m.hp <= 0 ? '#555' : pct > 50 ? '#66bb6a' : pct > 20 ? '#ffca28' : '#ef5350' }} title={`Nv.${m.level}`} />
          })}
        </div>
      </div>

      {c.player && <HpCard card={c.player} left={LAYOUT.playerX - 170} />}
      {c.enemy && <HpCard card={c.enemy} left={LAYOUT.enemyX + 52} />}
      {c.searching && <div class="searching" style={{ left: `${LAYOUT.playerX + 50}px` }}>procurando…</div>}

      <div class="log" style={{ left: `${LAYOUT.enemyX + 190}px` }}>
        {lines.map((l, i) => (
          <div key={i} class={i === lines.length - 1 ? 'log-last' : 'log-prev'}>
            {l}
          </div>
        ))}
      </div>

      {c.canCapture && (
        <button class="capture-btn" data-hit style={{ left: `${LAYOUT.enemyX + 580}px` }} onClick={() => c.requestCapture()} disabled={balls === 0} title="Tentar capturar este Pokémon">
          ◓ Capturar
        </button>
      )}

      <div class="toasts" style={{ left: `${LAYOUT.enemyX + 190}px` }}>
        {c.toasts.map((t) => (
          <div key={t.id} class={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
      {!s.starterChosen && (
        <button class="start-btn" data-hit style={{ left: `${LAYOUT.playerX - 160}px` }} onClick={onMenu}>
          Escolher Pokémon inicial
        </button>
      )}
    </div>
  )
}
