// Detalhe de um Pokémon do jogador: status, IVs, natureza, habilidade, golpes, evolução.
import { species } from '../../../shared/data'
import { itemInfo, itemName } from '../../../shared/items'
import { expProgress, itemEvolution, maxHp } from '../../../shared/mon'
import { NATURES, STAT_KEYS, STAT_LABEL, ivGrade, ivPercent, monStats } from '../../../shared/stats'
import type { OwnedMon } from '../../../shared/types'
import { zoneById } from '../../../shared/world'
import { controller } from '../controller'
import { Bar, Gender, MoveChip, Sprite, TypeChip, abilityLabel, useGame } from './common'

export function MonDetail({ mon, onClose }: { mon: OwnedMon; onClose: () => void }) {
  const c = useGame()
  const sp = species(mon.species)
  const stats = monStats(mon)
  const [up, down] = NATURES[mon.nature] ?? ['atk', 'atk']
  const ab = abilityLabel(mon)
  const evoItems = Object.keys(c.state.items).filter((it) => itemInfo(it)?.kind === 'evo' && itemEvolution(mon, it))
  const zone = zoneById(mon.caughtAt)
  return (
    <div class="detail">
      <div class="detail-head">
        <Sprite id={mon.species} shiny={mon.shiny} size={72} />
        <div>
          <div class="detail-name">
            {mon.shiny && '✨ '}
            {sp.name} <Gender g={mon.gender} /> <span class="muted">Nv. {mon.level}</span>
          </div>
          <div class="row">
            {sp.types.map((t) => (
              <TypeChip key={t} t={t} />
            ))}
          </div>
          <div class="muted small">
            HP {mon.hp}/{maxHp(mon)} · XP <Bar value={expProgress(mon)} max={1} kind="xp" />
          </div>
        </div>
        <button class="close" onClick={onClose}>
          ✕
        </button>
      </div>

      <table class="stats">
        <thead>
          <tr>
            <th />
            <th>Base</th>
            <th>IV</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {STAT_KEYS.map((k) => (
            <tr key={k}>
              <td>
                {STAT_LABEL[k]}
                {up !== down && k === up && <span class="up"> ▲</span>}
                {up !== down && k === down && <span class="down"> ▼</span>}
              </td>
              <td>{sp.baseStats[k]}</td>
              <td class={mon.ivs[k] === 31 ? 'iv-max' : mon.ivs[k] === 0 ? 'iv-min' : ''}>{mon.ivs[k]}</td>
              <td>{stats[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="kv">
        <span>IV total</span>
        <b>
          {ivPercent(mon.ivs)}% — {ivGrade(mon.ivs)}
        </b>
      </div>
      <div class="kv">
        <span>Natureza</span>
        <b>{mon.nature}</b>
      </div>
      <div class="kv">
        <span>Habilidade</span>
        <b title={ab.effect}>{ab.name}</b>
      </div>
      <div class="muted small">{ab.effect}</div>
      <div class="kv">
        <span>Golpes</span>
        <span class="row wrap">
          {mon.moves.map((m) => (
            <MoveChip key={m} slug={m} />
          ))}
        </span>
      </div>
      <div class="kv">
        <span>Capturado</span>
        <span>
          {itemName(mon.ball)} · {zone?.name ?? 'início'} · {new Date(mon.caughtOn).toLocaleDateString('pt-BR')}
        </span>
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={mon.noEvolve}
          onChange={(e) => {
            mon.noEvolve = (e.target as HTMLInputElement).checked
            c.changed()
          }}
        />
        Não evoluir (trava evolução por nível)
      </label>
      {evoItems.length > 0 && (
        <div class="row wrap">
          {evoItems.map((it) => (
            <button
              key={it}
              onClick={() => {
                const ev = c.game.useEvoItem(mon.uid, it)
                if (ev) controller.toast(ev.text, 'great', 7000)
                c.changed()
              }}
            >
              Usar {itemName(it)} ({c.state.items[it]})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
