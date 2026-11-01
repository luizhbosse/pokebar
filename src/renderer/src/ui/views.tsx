// Telas do painel: Time, PC, Pokédex, Loja, Mapa, Regras, Opções e escolha do inicial.
import { useEffect, useMemo, useState } from 'preact/hooks'
import dexPt from '../../../shared/data/dex-ptbr.json'
import { SPECIES, species } from '../../../shared/data'
import { PARTY_MAX, STARTERS } from '../../../shared/game'
import { BALLS, MASTER_BALL, SHOP, itemName, releaseMoney } from '../../../shared/items'
import { expProgress, maxHp } from '../../../shared/mon'
import { STAT_KEYS, STAT_LABEL, ivPercent } from '../../../shared/stats'
import { DEFAULT_RULES, dexCounts, isUnlocked, zoneProgress, type CaptureRule } from '../../../shared/state'
import { ZONES, zoneSpecies } from '../../../shared/world'
import type { OwnedMon } from '../../../shared/types'
import { MonDetail } from './MonDetail'
import { Bar, Gender, MoveChip, Section, Sprite, TypeChip, abilityLabel, money, monName, useGame } from './common'

const DEX_PT = dexPt as Record<string, { genus: string; flavor: string }>

// ------------------------------------------------------------ Time

function MonCard({ m, actions, onOpen }: { m: OwnedMon; actions: preact.ComponentChildren; onOpen: () => void }) {
  const ab = abilityLabel(m)
  return (
    <div class={`mon-card${m.hp <= 0 ? ' fainted' : ''}`}>
      <div class="mon-sprite" onClick={onOpen} title="Detalhes">
        <Sprite id={m.species} shiny={m.shiny} size={56} />
      </div>
      <div class="mon-info">
        <div class="mon-title">
          {m.shiny && '✨'}
          <b>{monName(m)}</b> <Gender g={m.gender} /> <span class="muted">Nv.{m.level}</span>
          <span class="iv-badge" title="IV total">
            IV {ivPercent(m.ivs)}%
          </span>
        </div>
        <Bar value={m.hp} max={maxHp(m)} />
        <Bar value={expProgress(m)} max={1} kind="xp" />
        <div class="muted small" title={ab.effect}>
          {m.nature} · {ab.name}
        </div>
        <div class="row wrap">
          {m.moves.map((mv) => (
            <MoveChip key={mv} slug={mv} />
          ))}
        </div>
      </div>
      <div class="mon-actions">{actions}</div>
    </div>
  )
}

export function TeamView() {
  const c = useGame()
  const [open, setOpen] = useState<string | null>(null)
  const s = c.state
  const sel = [...s.party, ...s.box].find((m) => m.uid === open)
  if (sel) return <MonDetail mon={sel} onClose={() => setOpen(null)} />
  return (
    <Section title={`Time (${s.party.length}/${PARTY_MAX})`} right={<span class="muted small">O 1º vivo luta; os outros ganham metade da XP.</span>}>
      <div class="grid2">
        {s.party.map((m, i) => (
          <MonCard
            key={m.uid}
            m={m}
            onOpen={() => setOpen(m.uid)}
            actions={
              <>
                <button disabled={i === 0} onClick={() => (c.game.movePartySlot(m.uid, -1), c.changed())} title="Subir">
                  ▲
                </button>
                <button disabled={i === s.party.length - 1} onClick={() => (c.game.movePartySlot(m.uid, 1), c.changed())} title="Descer">
                  ▼
                </button>
                <button disabled={s.party.length <= 1} onClick={() => (c.game.toBox(m.uid), c.changed())} title="Mandar ao PC">
                  PC
                </button>
              </>
            }
          />
        ))}
      </div>
    </Section>
  )
}

// ------------------------------------------------------------ PC

export function PcView() {
  const c = useGame()
  const s = c.state
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'level' | 'iv' | 'dex'>('recent')
  const [onlyShiny, setOnlyShiny] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [swapWith, setSwapWith] = useState<string>('')
  const sel = s.box.find((m) => m.uid === open)
  if (sel) return <MonDetail mon={sel} onClose={() => setOpen(null)} />
  let list = s.box.filter((m) => monName(m).toLowerCase().includes(q.toLowerCase()) && (!onlyShiny || m.shiny))
  if (sort === 'level') list = [...list].sort((a, b) => b.level - a.level)
  if (sort === 'iv') list = [...list].sort((a, b) => ivPercent(b.ivs) - ivPercent(a.ivs))
  if (sort === 'dex') list = [...list].sort((a, b) => a.species - b.species)
  return (
    <Section
      title={`PC (${s.box.length})`}
      right={
        <span class="row">
          <input placeholder="buscar…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)}>
            <option value="recent">Recentes</option>
            <option value="level">Nível</option>
            <option value="iv">IV</option>
            <option value="dex">Nº Pokédex</option>
          </select>
          <label class="check">
            <input type="checkbox" checked={onlyShiny} onChange={(e) => setOnlyShiny((e.target as HTMLInputElement).checked)} />
            só shiny
          </label>
        </span>
      }
    >
      {s.party.length >= PARTY_MAX && (
        <div class="row small">
          Trocar com:
          <select value={swapWith} onChange={(e) => setSwapWith((e.target as HTMLSelectElement).value)}>
            <option value="">— escolha um do time —</option>
            {s.party.map((m) => (
              <option key={m.uid} value={m.uid}>
                {monName(m)} Nv.{m.level}
              </option>
            ))}
          </select>
        </div>
      )}
      {list.length === 0 && <div class="muted">Nada no PC ainda. Capturas com o time cheio vêm para cá.</div>}
      <div class="grid2">
        {list.slice(0, 120).map((m) => (
          <MonCard
            key={m.uid}
            m={m}
            onOpen={() => setOpen(m.uid)}
            actions={
              <>
                {s.party.length < PARTY_MAX ? (
                  <button onClick={() => (c.game.toParty(m.uid), c.changed())}>Time</button>
                ) : (
                  <button disabled={!swapWith} onClick={() => (c.game.swap(swapWith, m.uid), setSwapWith(''), c.changed())}>
                    Trocar
                  </button>
                )}
                {confirm === m.uid ? (
                  <button class="danger" onClick={() => (c.game.release(m.uid), setConfirm(null), c.changed())}>
                    Confirmar
                  </button>
                ) : (
                  <button onClick={() => setConfirm(m.uid)} title="Soltar na natureza">
                    Soltar {money(releaseMoney(m.level, ivPercent(m.ivs), m.shiny))}
                  </button>
                )}
              </>
            }
          />
        ))}
      </div>
      {list.length > 120 && <div class="muted small">Mostrando 120 de {list.length}. Use a busca.</div>}
    </Section>
  )
}

// ------------------------------------------------------------ Pokédex

const WHERE = (() => {
  const map = new Map<number, string[]>()
  for (const z of ZONES) {
    if (z.trainer) continue
    for (const sp of zoneSpecies(z)) {
      const l = map.get(sp) ?? []
      if (!l.includes(z.name)) l.push(z.name)
      map.set(sp, l)
    }
  }
  return map
})()

export function DexView() {
  const c = useGame()
  const s = c.state
  const [filter, setFilter] = useState<'all' | 'caught' | 'missing'>('all')
  const [sel, setSel] = useState<number | null>(null)
  const counts = dexCounts(s)
  const list = SPECIES.filter((sp) => {
    const d = s.dex[sp.id]
    if (filter === 'caught') return d?.caught
    if (filter === 'missing') return !d?.caught
    return true
  })
  const selSp = sel ? species(sel) : null
  const d = sel ? s.dex[sel] : undefined
  const pt = sel ? DEX_PT[String(sel)] : undefined
  return (
    <div class="dex">
      <div class="dex-grid-wrap">
        <div class="section-head">
          <h3>
            Pokédex — vistos {counts.seen} · capturados {counts.caught}/251
          </h3>
          <select value={filter} onChange={(e) => setFilter((e.target as HTMLSelectElement).value as typeof filter)}>
            <option value="all">Todos</option>
            <option value="caught">Capturados</option>
            <option value="missing">Faltando</option>
          </select>
        </div>
        <div class="dex-grid">
          {list.map((sp) => {
            const e = s.dex[sp.id]
            return (
              <div key={sp.id} class={`dex-cell${sel === sp.id ? ' sel' : ''}${e?.caught ? ' caught' : ''}`} onClick={() => setSel(sp.id)} title={e?.seen ? sp.name : '???'}>
                {e?.seen ? <Sprite id={sp.id} size={40} dim={!e.caught} /> : <span class="unknown">?</span>}
                <span class="dex-no">{String(sp.id).padStart(3, '0')}</span>
                {e?.shiny && <span class="dex-shiny">✨</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div class="dex-detail">
        {!selSp && <div class="muted">Clique numa espécie.</div>}
        {selSp && !d?.seen && (
          <div>
            <b>#{String(selSp.id).padStart(3, '0')} ???</b>
            <div class="muted">Ainda não visto.</div>
          </div>
        )}
        {selSp && d?.seen && (
          <div>
            <div class="row">
              <Sprite id={selSp.id} size={80} />
              {d.shiny && <Sprite id={selSp.id} shiny size={80} />}
            </div>
            <b>
              #{String(selSp.id).padStart(3, '0')} {selSp.name}
            </b>
            <div class="muted small">{pt?.genus}</div>
            <div class="row">
              {selSp.types.map((t) => (
                <TypeChip key={t} t={t} />
              ))}
            </div>
            <div class="small">
              {(selSp.height / 10).toLocaleString('pt-BR')} m · {(selSp.weight / 10).toLocaleString('pt-BR')} kg
            </div>
            <p class="flavor">{pt?.flavor}</p>
            {STAT_KEYS.map((k) => (
              <div key={k} class="stat-line">
                <span>{STAT_LABEL[k]}</span>
                <b>{selSp.baseStats[k]}</b>
                <Bar value={selSp.baseStats[k]} max={180} kind="stat" />
              </div>
            ))}
            <div class="small">{d.caught ? `Capturado · melhor IV ${d.bestIv}%${d.shiny ? ' · shiny ✨' : ''}` : 'Visto, não capturado'}</div>
            <div class="small muted">Onde: {(WHERE.get(selSp.id) ?? ['evolução']).join(', ')}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ Loja

export function ShopView() {
  const c = useGame()
  const s = c.state
  const badges = s.badges.length
  const items = [...SHOP]
  return (
    <Section title="Loja" right={<b>{money(s.money)}</b>}>
      <div class="shop">
        {items.map((it) => {
          const locked = it.badges > badges
          return (
            <div key={it.slug} class={`shop-item${locked ? ' locked' : ''}`}>
              <img class="item-img" src={`sprites/items/${it.slug}.png`} />
              <div class="shop-info">
                <b>{it.name}</b> <span class="muted small">tem {s.items[it.slug] ?? 0}</span>
                <div class="muted small">{locked ? `Libera com ${it.badges} insígnia(s).` : it.desc}</div>
              </div>
              <div class="shop-buy">
                <span>{money(it.price)}</span>
                {!locked &&
                  [1, 5, 10].map((n) => (
                    <button key={n} disabled={s.money < it.price * n} onClick={() => (c.game.buy(it.slug, n), c.changed())}>
                      ×{n}
                    </button>
                  ))}
              </div>
            </div>
          )
        })}
        {(s.items[MASTER_BALL.slug] ?? 0) > 0 && (
          <div class="shop-item">
            <img class="item-img" src="sprites/items/master-ball.png" />
            <div class="shop-info">
              <b>Master Ball</b> <span class="muted small">tem {s.items[MASTER_BALL.slug]}</span>
              <div class="muted small">{MASTER_BALL.desc} Usada só em lendários e shiny.</div>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ------------------------------------------------------------ Mapa

const ALL_BADGES = ['Zephyr', 'Hive', 'Plain', 'Fog', 'Storm', 'Mineral', 'Glacier', 'Rising', 'Thunder', 'Marsh', 'Rainbow', 'Soul', 'Cascade', 'Boulder', 'Volcano', 'Earth']

export function MapView() {
  const c = useGame()
  const s = c.state
  return (
    <Section
      title="Mapa"
      right={
        <label class="check">
          <input type="checkbox" checked={s.settings.autoAdvance} onChange={(e) => ((s.settings.autoAdvance = (e.target as HTMLInputElement).checked), c.changed())} />
          Avançar automaticamente
        </label>
      }
    >
      <div class="badges">
        {ALL_BADGES.map((b) => (
          <span key={b} class={`badge${s.badges.includes(b) ? ' on' : ''}`} title={b}>
            {b}
          </span>
        ))}
      </div>
      <div class="zones">
        {ZONES.map((z) => {
          const unlocked = isUnlocked(s, z.id)
          const p = zoneProgress(s, z.id)
          const here = s.zone === z.id
          const icon = here ? '▶' : p.cleared ? '✓' : unlocked ? '•' : '🔒'
          return (
            <div key={z.id} class={`zone-row${here ? ' here' : ''}${unlocked ? '' : ' locked'}`}>
              <span class="zone-icon">{icon}</span>
              <span class="zone-title">
                {z.region === 'kanto' ? '[Kanto] ' : ''}
                {z.name}
              </span>
              <span class="muted small">
                {z.kind === 'route' ? `Nv. ${z.levels[0]}–${z.levels[1]} · ${Math.min(p.wins, z.wins)}/${z.wins}` : z.trainer?.badge ? `Insígnia ${z.trainer.badge}` : z.kind === 'champion' ? 'Campeão' : 'Elite 4'}
                {(z.events ?? []).some((e) => !s.eventsCaught.includes(e.id)) ? ' · ★ algo raro por aqui' : ''}
              </span>
              <button
                disabled={!unlocked || here}
                onClick={() => {
                  c.game.setZone(z.id).forEach((a) => c.toast(a.text))
                  c.changed()
                }}
              >
                Ir
              </button>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ------------------------------------------------------------ Regras de captura

const WHEN_LABEL: Record<CaptureRule['when'], string> = {
  shiny: 'Se for shiny',
  legendary: 'Se for lendário/mítico',
  new: 'Espécie ainda não capturada',
  species: 'Espécie específica',
  all: 'Qualquer Pokémon'
}

export function RulesView() {
  const c = useGame()
  const s = c.state
  const [newSpecies, setNewSpecies] = useState('')
  const seen = SPECIES.filter((sp) => s.dex[sp.id]?.seen)
  const ballOptions = (
    <>
      <option value="cheapest">Mais barata que eu tiver</option>
      <option value="best">Melhor chance (inclui Apricorn)</option>
      {BALLS.map((b) => (
        <option key={b} value={b}>
          {itemName(b)}
        </option>
      ))}
    </>
  )
  const update = (r: CaptureRule, patch: Partial<CaptureRule>): void => {
    Object.assign(r, patch)
    c.changed()
  }
  return (
    <Section title="Regras de captura" right={<span class="muted small">A 1ª regra ligada que casar decide a bola. Sem regra = só luta.</span>}>
      <div class="rules">
        {s.rules.map((r, i) => (
          <div key={r.id} class="rule">
            <input type="checkbox" checked={r.enabled} onChange={(e) => update(r, { enabled: (e.target as HTMLInputElement).checked })} />
            <span class="rule-when">{r.when === 'species' ? `${WHEN_LABEL.species}: ${species(r.species ?? 1).name}` : WHEN_LABEL[r.when]}</span>
            <select value={r.ball} onChange={(e) => update(r, { ball: (e.target as HTMLSelectElement).value })}>
              {ballOptions}
            </select>
            <label class="small">
              máx.
              <input type="number" min={1} max={99} value={r.maxThrows} onChange={(e) => update(r, { maxThrows: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) })} />
              bolas
            </label>
            <button disabled={i === 0} onClick={() => ((s.rules.splice(i - 1, 0, ...s.rules.splice(i, 1)), c.changed()))}>
              ▲
            </button>
            {r.when === 'species' && (
              <button class="danger" onClick={() => (s.rules.splice(i, 1), c.changed())}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <div class="row">
        <select value={newSpecies} onChange={(e) => setNewSpecies((e.target as HTMLSelectElement).value)}>
          <option value="">+ regra para uma espécie já vista…</option>
          {seen.map((sp) => (
            <option key={sp.id} value={sp.id}>
              #{sp.id} {sp.name}
            </option>
          ))}
        </select>
        <button
          disabled={!newSpecies}
          onClick={() => {
            s.rules.unshift({ id: `r-${Date.now()}`, enabled: true, when: 'species', species: Number(newSpecies), ball: 'best', maxThrows: 10 })
            setNewSpecies('')
            c.changed()
          }}
        >
          Adicionar
        </button>
        <button onClick={() => ((s.rules = structuredClone(DEFAULT_RULES)), c.changed())}>Restaurar padrão</button>
      </div>
      <div class="muted small">
        Com o HP do selvagem baixo (ou dormindo/paralisado) o jogo arremessa sozinho. Golpes que poderiam nocautear são evitados enquanto tenta capturar. O botão “Capturar” na faixa força uma tentativa com a melhor bola que você tiver.
      </div>
    </Section>
  )
}

// ------------------------------------------------------------ Opções

export function OptionsView() {
  const c = useGame()
  const s = c.state
  const o = s.settings
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([])
  useEffect(() => {
    void window.pokebar.displays().then(setDisplays)
  }, [])
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]): void => {
    o[k] = v
    c.applySettings()
  }
  const h = Math.floor(s.stats.playMs / 3_600_000)
  const min = Math.floor((s.stats.playMs % 3_600_000) / 60_000)
  return (
    <div class="options">
      <Section title="Som">
        <label class="opt">
          Volume <input type="range" min={0} max={1} step={0.05} value={o.volume} onInput={(e) => set('volume', Number((e.target as HTMLInputElement).value))} />
        </label>
        <label class="check">
          <input type="checkbox" checked={o.cries} onChange={(e) => set('cries', (e.target as HTMLInputElement).checked)} /> Gritos dos Pokémon
        </label>
        <label class="check">
          <input type="checkbox" checked={o.sfx} onChange={(e) => set('sfx', (e.target as HTMLInputElement).checked)} /> Efeitos (captura, evolução, insígnia, shiny)
        </label>
        <label class="check">
          <input type="checkbox" checked={o.battleSounds} onChange={(e) => set('battleSounds', (e.target as HTMLInputElement).checked)} /> Som de cada golpe e encontro
        </label>
        <label class="check">
          <input type="checkbox" checked={o.music} onChange={(e) => set('music', (e.target as HTMLInputElement).checked)} /> Música chiptune (original)
        </label>
        <label class="opt">
          Volume da música <input type="range" min={0} max={1} step={0.05} value={o.musicVolume} onInput={(e) => set('musicVolume', Number((e.target as HTMLInputElement).value))} />
        </label>
      </Section>
      <Section title="Jogo">
        <label class="opt">
          Velocidade das animações
          <select value={o.speed} onChange={(e) => set('speed', Number((e.target as HTMLSelectElement).value))}>
            <option value={1}>1×</option>
            <option value={1.5}>1,5×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <label class="opt">
          Usar Potion quando o HP ficar abaixo de {o.potionThreshold}%
          <input type="range" min={0} max={80} step={5} value={o.potionThreshold} onInput={(e) => set('potionThreshold', Number((e.target as HTMLInputElement).value))} />
        </label>
        <label class="check">
          <input type="checkbox" checked={o.autoRevive} onChange={(e) => set('autoRevive', (e.target as HTMLInputElement).checked)} /> Usar Revive sozinho depois da batalha
        </label>
        <label class="check">
          <input type="checkbox" checked={o.autoAdvance} onChange={(e) => set('autoAdvance', (e.target as HTMLInputElement).checked)} /> Avançar de zona automaticamente
        </label>
      </Section>
      <Section title="Faixa">
        <label class="opt">
          Largura {o.stripWidthPct}%
          <input type="range" min={40} max={100} step={5} value={o.stripWidthPct} onInput={(e) => set('stripWidthPct', Number((e.target as HTMLInputElement).value))} />
        </label>
        <label class="opt">
          Alinhamento
          <select value={o.stripAlign} onChange={(e) => set('stripAlign', (e.target as HTMLSelectElement).value as typeof o.stripAlign)}>
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </label>
        <label class="opt">
          Monitor
          <select value={o.displayId ?? ''} onChange={(e) => set('displayId', (e.target as HTMLSelectElement).value ? Number((e.target as HTMLSelectElement).value) : null)}>
            <option value="">Principal</option>
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={o.openAtLogin}
            onChange={(e) => {
              set('openAtLogin', (e.target as HTMLInputElement).checked)
              window.pokebar.setLoginItem(o.openAtLogin)
            }}
          />{' '}
          Iniciar com o Windows
        </label>
        <div class="muted small">Atalho global: Ctrl+Alt+P mostra/esconde a faixa.</div>
      </Section>
      <Section title="Save e estatísticas">
        <div class="small">
          Batalhas: {s.stats.battles.toLocaleString('pt-BR')} · Capturas: {s.stats.caught} · Shiny: {s.stats.shinies} · Tempo de jogo: {h}h{String(min).padStart(2, '0')}
        </div>
        <div class="row">
          <button onClick={() => void c.save().then(() => c.toast('Jogo salvo.'))}>Salvar agora</button>
          <button onClick={() => window.pokebar.openSaveFolder()}>Abrir pasta do save</button>
          <button class="danger" onClick={() => void c.save().then(() => window.pokebar.quit())}>
            Salvar e sair
          </button>
        </div>
      </Section>
    </div>
  )
}

// ------------------------------------------------------------ Inicial

export function StarterView() {
  const c = useGame()
  const [pick, setPick] = useState<number | null>(null)
  const list = useMemo(() => STARTERS.map((id) => species(id)), [])
  return (
    <Section title="Escolha seu primeiro Pokémon">
      <div class="starters">
        {list.map((sp) => (
          <div key={sp.id} class={`starter${pick === sp.id ? ' sel' : ''}`} onClick={() => setPick(sp.id)}>
            <Sprite id={sp.id} size={72} />
            <b>{sp.name}</b>
            <div class="row">
              {sp.types.map((t) => (
                <TypeChip key={t} t={t} />
              ))}
            </div>
            <div class="muted small">{DEX_PT[String(sp.id)]?.genus}</div>
          </div>
        ))}
      </div>
      <div class="row">
        <button class="primary" disabled={!pick} onClick={() => pick && c.chooseStarter(pick)}>
          {pick ? `Escolher ${species(pick).name}` : 'Escolha um'}
        </button>
        <span class="muted small">
          Você começa com ₽3.000 e nenhuma Poké Ball — compre na Loja para poder capturar. O IV é sorteado em cada captura.
        </span>
      </div>
    </Section>
  )
}

export const VIEWS = {
  team: { label: 'Time', C: TeamView },
  pc: { label: 'PC', C: PcView },
  dex: { label: 'Pokédex', C: DexView },
  shop: { label: 'Loja', C: ShopView },
  map: { label: 'Mapa', C: MapView },
  rules: { label: 'Regras', C: RulesView },
  options: { label: 'Opções', C: OptionsView }
} as const

export type ViewKey = keyof typeof VIEWS
