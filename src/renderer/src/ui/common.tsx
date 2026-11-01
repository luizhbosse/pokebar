// Componentes e utilidades compartilhados pela interface.
import { useEffect, useReducer } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { ABILITY_EFFECT_PT } from '../../../shared/abilities'
import { ABILITIES, MOVES, species } from '../../../shared/data'
import { TYPE_COLOR, TYPE_LABEL } from '../../../shared/typechart'
import type { OwnedMon, TypeName } from '../../../shared/types'
import { controller } from '../controller'
import { spriteUrl } from '../scene'

/** Re-renderiza quando o controller avisa mudança. */
export function useGame(): typeof controller {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => controller.subscribe(() => force(undefined)), [])
  return controller
}

export const money = (n: number): string => `₽${n.toLocaleString('pt-BR')}`

export function Sprite({ id, shiny = false, size = 48, back = false, dim = false }: { id: number; shiny?: boolean; size?: number; back?: boolean; dim?: boolean }) {
  return (
    <img
      class={`sprite${dim ? ' dim' : ''}`}
      src={spriteUrl(id, shiny, back)}
      style={{ width: `${size}px`, height: `${size}px` }}
      loading="lazy"
      draggable={false}
    />
  )
}

export function TypeChip({ t }: { t: TypeName }) {
  return (
    <span class="type" style={{ background: TYPE_COLOR[t] }}>
      {TYPE_LABEL[t]}
    </span>
  )
}

export function Bar({ value, max, kind = 'hp' }: { value: number; max: number; kind?: 'hp' | 'xp' | 'stat' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  const color = kind === 'xp' ? '#4fc3f7' : kind === 'stat' ? '#9575cd' : pct > 50 ? '#66bb6a' : pct > 20 ? '#ffca28' : '#ef5350'
  return (
    <div class={`bar bar-${kind}`}>
      <div class="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function MoveChip({ slug }: { slug: string }) {
  const m = MOVES[slug]
  if (!m) return null
  const detail = m.category === 'status' ? 'status' : `poder ${m.power ?? '—'} · ${m.category === 'physical' ? 'físico' : 'especial'}`
  return (
    <span class="move" style={{ borderColor: TYPE_COLOR[m.type] }} title={`${m.name} — ${TYPE_LABEL[m.type]} · ${detail} · precisão ${m.accuracy ?? '—'}`}>
      {m.name}
    </span>
  )
}

export function abilityLabel(m: OwnedMon): { name: string; effect: string } {
  const a = ABILITIES[m.ability]
  return {
    name: `${a?.name ?? m.ability}${m.hiddenAbility ? ' (oculta)' : ''}`,
    effect: ABILITY_EFFECT_PT[m.ability] ?? 'Sem efeito no idle.'
  }
}

export const monName = (m: OwnedMon): string => species(m.species).name

export function Gender({ g }: { g: OwnedMon['gender'] }) {
  if (!g) return null
  return <span class={g === 'M' ? 'g-m' : 'g-f'}>{g === 'M' ? '♂' : '♀'}</span>
}

export function Section({ title, children, right }: { title: string; children: ComponentChildren; right?: ComponentChildren }) {
  return (
    <div class="section">
      <div class="section-head">
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}
