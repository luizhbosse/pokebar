// Baixa da PokeAPI tudo o que o jogo precisa das 251 espécies (Gen 1 e 2) e gera os dados do jogo.
// Uso: node scripts/build-data.mjs
// - Respostas da API ficam em .cache/pokeapi (rodar de novo não baixa outra vez).
// - Saída: src/shared/data/*.json e src/renderer/public/{sprites,cries}/...
// Regras modernas (D15): tipos, status, poder/precisão dos golpes e habilidades atuais.
// Golpes aprendidos: level-up do Crystal (D6). Evoluções por troca/amizade convertidas (D6).

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache', 'pokeapi')
const DATA_OUT = join(ROOT, 'src', 'shared', 'data')
const PUBLIC = join(ROOT, 'src', 'renderer', 'public')
const API = 'https://pokeapi.co/api/v2'
const UA = 'pokebar-personal/0.1 (uso pessoal)'
const MAX_ID = 251
const GSC = new Set(['gold', 'silver', 'crystal'])
const CONCURRENCY = 8

// ---------------------------------------------------------------- utilidades

const exists = (p) => access(p).then(() => true, () => false)

async function fetchRetry(url, asBuffer = false) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.json()
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
}

/** GET com cache em disco. `path` é relativo a /api/v2 (ex.: "pokemon/25"). */
async function api(path) {
  const file = join(CACHE, path.replace(/[/?=&]/g, '_') + '.json')
  if (await exists(file)) return JSON.parse(await readFile(file, 'utf8'))
  const json = await fetchRetry(`${API}/${path}`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(json))
  return json
}

async function download(url, dest) {
  if (!url) return false
  if (await exists(dest)) return true
  const buf = await fetchRetry(url, true)
  if (!buf) return false
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return true
}

/** map com limite de concorrência. */
async function pool(items, fn, limit = CONCURRENCY) {
  const out = new Array(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
      done++
      if (done % 50 === 0 || done === items.length) process.stdout.write(`  ${done}/${items.length}\r`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  process.stdout.write('\n')
  return out
}

const idFromUrl = (url) => Number(url.split('/').filter(Boolean).pop())
const en = (list, field = 'name') => list.find((x) => x.language.name === 'en')?.[field]
const clean = (s) => (s ?? '').replace(/[\f\n\r­]+/g, ' ').replace(/\s+/g, ' ').trim()

const STAT_KEY = {
  hp: 'hp',
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  speed: 'spe'
}

// ------------------------------------------- conversão de evoluções (D6)
// Amizade e troca não existem num jogo idle solo: viram nível fixo ou item da loja.
const EVO_OVERRIDES = {
  // amizade → nível
  172: [{ to: 25, kind: 'level', level: 12 }], // Pichu
  173: [{ to: 35, kind: 'level', level: 12 }], // Cleffa
  174: [{ to: 39, kind: 'level', level: 12 }], // Igglybuff
  175: [{ to: 176, kind: 'level', level: 15 }], // Togepi
  42: [{ to: 169, kind: 'level', level: 35 }], // Golbat → Crobat
  113: [{ to: 242, kind: 'level', level: 40 }], // Chansey → Blissey
  // troca → nível
  64: [{ to: 65, kind: 'level', level: 37 }], // Kadabra
  67: [{ to: 68, kind: 'level', level: 40 }], // Machoke
  75: [{ to: 76, kind: 'level', level: 40 }], // Graveler
  93: [{ to: 94, kind: 'level', level: 38 }], // Haunter
  // troca segurando item → item da loja
  95: [{ to: 208, kind: 'item', item: 'metal-coat' }], // Onix → Steelix
  123: [{ to: 212, kind: 'item', item: 'metal-coat' }], // Scyther → Scizor
  117: [{ to: 230, kind: 'item', item: 'dragon-scale' }], // Seadra → Kingdra
  79: [
    { to: 80, kind: 'level', level: 37 },
    { to: 199, kind: 'item', item: 'kings-rock' }
  ], // Slowpoke → Slowbro / Slowking
  61: [
    { to: 62, kind: 'item', item: 'water-stone' },
    { to: 186, kind: 'item', item: 'kings-rock' }
  ], // Poliwhirl → Poliwrath / Politoed
  137: [{ to: 233, kind: 'item', item: 'up-grade' }], // Porygon → Porygon2
  // Tyrogue: nível 20, decide pelo Ataque x Defesa (regra real)
  236: [
    { to: 106, kind: 'tyrogue', level: 20, cmp: 'atk>def' },
    { to: 107, kind: 'tyrogue', level: 20, cmp: 'atk<def' },
    { to: 237, kind: 'tyrogue', level: 20, cmp: 'atk=def' }
  ]
}
// Eevee: pedras da loja + amizade de dia/noite → nível 25 conforme o relógio real
const EEVEE_TIME = [
  { to: 196, kind: 'level-time', level: 25, time: 'day' },
  { to: 197, kind: 'level-time', level: 25, time: 'night' }
]

function parseChain(node, out) {
  const from = idFromUrl(node.species.url)
  for (const next of node.evolves_to) {
    const to = idFromUrl(next.species.url)
    if (to <= MAX_ID && from <= MAX_ID) {
      for (const d of next.evolution_details) {
        const trigger = d.trigger?.name
        let evo = null
        if (trigger === 'level-up' && d.min_level && !d.min_happiness) {
          evo = { to, kind: 'level', level: d.min_level }
        } else if (trigger === 'use-item' && d.item) {
          evo = { to, kind: 'item', item: d.item.name }
        }
        if (evo) (out[from] ??= []).push(evo)
      }
    }
    parseChain(next, out)
  }
}

// ---------------------------------------------------------------- principal

async function main() {
  const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1)

  console.log('1/7 Pokémon e espécies...')
  const pokemon = await pool(ids, (id) => api(`pokemon/${id}`))
  const species = await pool(ids, (id) => api(`pokemon-species/${id}`))

  console.log('2/7 Encontros (Gold/Silver/Crystal)...')
  const encountersRaw = await pool(ids, (id) => api(`pokemon/${id}/encounters`))

  console.log('3/7 Cadeias de evolução...')
  const chainUrls = [...new Set(species.map((s) => s.evolution_chain.url))]
  const chains = await pool(chainUrls, (url) => api(`evolution-chain/${idFromUrl(url)}`))
  const evolutions = {}
  for (const c of chains) parseChain(c.chain, evolutions)
  for (const [from, list] of Object.entries(EVO_OVERRIDES)) evolutions[from] = list
  evolutions[133] = [...(evolutions[133] ?? []).filter((e) => e.kind === 'item'), ...EEVEE_TIME]

  console.log('4/7 Golpes (level-up do Crystal)...')
  const learnsets = {}
  const moveSlugs = new Set()
  for (const p of pokemon) {
    const ls = []
    for (const m of p.moves) {
      for (const d of m.version_group_details) {
        if (d.version_group.name === 'crystal' && d.move_learn_method.name === 'level-up') {
          ls.push([d.level_learned_at, m.move.name])
          moveSlugs.add(m.move.name)
        }
      }
    }
    ls.sort((a, b) => a[0] - b[0])
    learnsets[p.id] = ls
  }
  const moveList = await pool([...moveSlugs], (slug) => api(`move/${slug}`))
  const moves = {}
  for (const m of moveList) {
    moves[m.name] = {
      id: m.id,
      slug: m.name,
      name: en(m.names) ?? m.name,
      type: m.type.name,
      power: m.power,
      accuracy: m.accuracy,
      pp: m.pp,
      priority: m.priority,
      category: m.damage_class.name, // physical | special | status
      target: m.target.name,
      effectChance: m.effect_chance,
      meta: m.meta
        ? {
            category: m.meta.category?.name ?? null,
            ailment: m.meta.ailment?.name ?? 'none',
            ailmentChance: m.meta.ailment_chance,
            drain: m.meta.drain,
            healing: m.meta.healing,
            critRate: m.meta.crit_rate,
            minHits: m.meta.min_hits,
            maxHits: m.meta.max_hits,
            flinchChance: m.meta.flinch_chance
          }
        : null,
      shortEffect: clean(en(m.effect_entries, 'short_effect'))?.replace(/\$effect_chance/g, String(m.effect_chance ?? ''))
    }
  }

  console.log('5/7 Habilidades...')
  const abilitySlugs = new Set(pokemon.flatMap((p) => p.abilities.map((a) => a.ability.name)))
  const abilityList = await pool([...abilitySlugs], (slug) => api(`ability/${slug}`))
  const abilities = {}
  for (const a of abilityList) {
    abilities[a.name] = {
      slug: a.name,
      name: en(a.names) ?? a.name,
      shortEffect: clean(en(a.effect_entries, 'short_effect'))
    }
  }

  // ------------------------------------------------ espécies + Pokédex (en)
  const speciesOut = []
  const dexEn = {}
  for (let i = 0; i < MAX_ID; i++) {
    const p = pokemon[i]
    const s = species[i]
    const stats = {}
    for (const st of p.stats) stats[STAT_KEY[st.stat.name]] = st.base_stat
    const flavor =
      ['crystal', 'gold', 'silver']
        .map((v) => s.flavor_text_entries.find((f) => f.language.name === 'en' && f.version.name === v))
        .find(Boolean) ?? s.flavor_text_entries.find((f) => f.language.name === 'en')
    speciesOut.push({
      id: p.id,
      slug: s.name,
      name: en(s.names) ?? s.name,
      types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      baseStats: stats,
      baseExp: p.base_experience,
      catchRate: s.capture_rate,
      growthRate: s.growth_rate.name,
      genderRate: s.gender_rate, // -1 sem gênero; senão oitavos de chance de fêmea
      height: p.height, // decímetros
      weight: p.weight, // hectogramas
      abilities: {
        normal: p.abilities.filter((a) => !a.is_hidden).map((a) => a.ability.name),
        hidden: p.abilities.find((a) => a.is_hidden)?.ability.name ?? null
      },
      isLegendary: s.is_legendary,
      isMythical: s.is_mythical,
      isBaby: s.is_baby,
      evolvesFrom: s.evolves_from_species && idFromUrl(s.evolves_from_species.url) <= MAX_ID ? idFromUrl(s.evolves_from_species.url) : null,
      evolutions: evolutions[p.id] ?? [],
      learnset: learnsets[p.id]
    })
    dexEn[p.id] = { name: en(s.names), genus: en(s.genera, 'genus'), flavor: clean(flavor?.flavor_text) }
  }

  // ------------------------------------------------ encontros por área
  const encounters = {} // área → lista
  for (let i = 0; i < MAX_ID; i++) {
    for (const e of encountersRaw[i] ?? []) {
      for (const vd of e.version_details) {
        if (!GSC.has(vd.version.name)) continue
        for (const d of vd.encounter_details) {
          ;(encounters[e.location_area.name] ??= []).push({
            species: i + 1,
            version: vd.version.name,
            minLevel: d.min_level,
            maxLevel: d.max_level,
            chance: d.chance,
            method: d.method.name,
            conditions: d.condition_values.map((c) => c.name)
          })
        }
      }
    }
  }

  console.log('6/7 Gravando JSON...')
  await mkdir(DATA_OUT, { recursive: true })
  const write = (name, obj) => writeFile(join(DATA_OUT, name), JSON.stringify(obj))
  await write('species.json', speciesOut)
  await write('moves.json', moves)
  await write('abilities.json', abilities)
  await write('encounters.json', encounters)
  await writeFile(join(DATA_OUT, 'dex-en.json'), JSON.stringify(dexEn, null, 1))

  console.log('7/7 Sprites e gritos...')
  const jobs = []
  for (const p of pokemon) {
    const bw = p.sprites.versions['generation-v']['black-white']
    const a = bw.animated
    const dir = join(PUBLIC, 'sprites', 'pokemon')
    jobs.push([a.front_default ?? bw.front_default, join(dir, `${p.id}.gif`)])
    jobs.push([a.front_shiny ?? bw.front_shiny, join(dir, `${p.id}-s.gif`)])
    jobs.push([a.back_default ?? bw.back_default, join(dir, `${p.id}-b.gif`)])
    jobs.push([a.back_shiny ?? bw.back_shiny, join(dir, `${p.id}-bs.gif`)])
    jobs.push([p.cries?.legacy ?? p.cries?.latest, join(PUBLIC, 'cries', `${p.id}.ogg`)])
  }
  const ITEMS = [
    'poke-ball', 'great-ball', 'ultra-ball', 'master-ball',
    'fast-ball', 'lure-ball', 'heavy-ball', 'moon-ball', 'love-ball', 'level-ball', 'friend-ball',
    'potion', 'super-potion', 'hyper-potion', 'revive',
    'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone',
    'metal-coat', 'dragon-scale', 'kings-rock', 'up-grade'
  ]
  const items = await pool(ITEMS, (slug) => api(`item/${slug}`))
  const itemsOut = {}
  for (const it of items) {
    if (!it) continue
    itemsOut[it.name] = { slug: it.name, name: en(it.names) ?? it.name, cost: it.cost }
    jobs.push([it.sprites?.default, join(PUBLIC, 'sprites', 'items', `${it.name}.png`)])
  }
  await write('items.json', itemsOut)
  const results = await pool(jobs, ([url, dest]) => download(url, dest).catch((e) => (console.error(e.message), false)))
  const missing = jobs.filter((_, i) => !results[i]).map(([, dest]) => dest)

  // ------------------------------------------------ relatório
  const wild = new Set(Object.values(encounters).flat().map((e) => e.species))
  const notWild = speciesOut.filter((s) => !wild.has(s.id)).map((s) => `${s.id} ${s.name}`)
  console.log(`\nEspécies: ${speciesOut.length} · golpes: ${moveList.length} · habilidades: ${abilityList.length}`)
  console.log(`Áreas com encontros GSC: ${Object.keys(encounters).length}`)
  console.log(`Sem encontro em GSC (${notWild.length}): ${notWild.join(', ')}`)
  console.log(`Arquivos faltando (${missing.length}): ${missing.slice(0, 20).join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
