// Mapa (D4/D4b): Johto → Elite 4 → Kanto → Red, com as tabelas reais de G/S/C.
// Níveis por zona são definidos aqui (as tabelas de vara/headbutt do G/S/C têm níveis fixos que
// quebrariam a curva); da PokeAPI vêm as espécies e os pesos.
// Times de líderes: espécies do Crystal. Níveis de Johto são os reais; os de Kanto (e de Red)
// foram subidos para Kanto não virar passeio depois do Lance — ajustável.
// Brock: Golem/Rhydon/Steelix no lugar das formas iniciais, para combinar com o nível.

import { BALANCE } from './balance'
import { ENCOUNTERS, species } from './data'
import { weighted } from './rng'

export type ZoneKind = 'route' | 'gym' | 'elite' | 'champion' | 'boss'

export interface ZoneExtra {
  species: number
  /** Probabilidade absoluta por encontro. */
  p: number
}

export interface ZoneEvent {
  id: string
  species: number
  level: number
  /** Chance por encontro depois de liberado. */
  p: number
  shiny?: boolean
  requires?: { defeated?: string; friday?: boolean }
}

export interface Trainer {
  title: string
  name: string
  team: [number, number][]
  reward: number
  badge?: string
  prize?: string // item ganho (ex.: master-ball)
}

export interface Zone {
  id: string
  name: string
  region: 'johto' | 'kanto'
  kind: ZoneKind
  areas: string[]
  levels: [number, number]
  /** Vitórias para liberar a próxima zona (rotas). */
  wins: number
  extras?: ZoneExtra[]
  events?: ZoneEvent[]
  trainer?: Trainer
  /** Encontros próprios (espécie, peso), somados aos da PokeAPI. */
  custom?: [number, number][]
}

const route = (
  id: string,
  name: string,
  region: 'johto' | 'kanto',
  areas: string[],
  levels: [number, number],
  wins: number,
  more: Partial<Zone> = {}
): Zone => ({ id, name, region, kind: 'route', areas, levels, wins: Math.round(wins * BALANCE.routeWinsMult), ...more })

const gym = (id: string, region: 'johto' | 'kanto', trainer: Trainer, kind: ZoneKind = 'gym'): Zone => ({
  id,
  name: `${trainer.title} ${trainer.name}`,
  region,
  kind,
  areas: [],
  levels: [0, 0],
  wins: 1,
  trainer
})

const BABIES: ZoneExtra[] = [172, 173, 174, 236, 238, 239, 240].map((s) => ({ species: s, p: 0.004 }))

export const ZONES: Zone[] = [
  // ------------------------------------------------------------------ JOHTO
  route('r29', 'Rota 29', 'johto', ['johto-route-29-area', 'new-bark-town-area'], [2, 4], 8, {
    extras: [152, 155, 158].map((s) => ({ species: s, p: 0.003 }))
  }),
  route('r30', 'Rota 30', 'johto', ['johto-route-30-area', 'cherrygrove-city-area'], [3, 5], 10),
  route('r31', 'Rota 31 e Dark Cave', 'johto', ['johto-route-31-area', 'dark-cave-violet-city-entrance'], [4, 6], 10),
  route('sprout', 'Sprout Tower', 'johto', ['sprout-tower-2f', 'sprout-tower-3f', 'violet-city-area'], [4, 7], 8),
  gym('falkner', 'johto', { title: 'Líder', name: 'Falkner', team: [[16, 7], [17, 9]], reward: 900, badge: 'Zephyr' }),
  route('r32', 'Rota 32 e Ruins of Alph', 'johto', ['johto-route-32-area', 'ruins-of-alph-outside', 'ruins-of-alph-interior-a'], [6, 9], 10, {
    extras: [{ species: 175, p: 0.01 }]
  }),
  route('union', 'Union Cave e Rota 33', 'johto', ['union-cave-1f', 'union-cave-b1f', 'johto-route-33-area'], [7, 10], 10),
  route('slowpoke', 'Slowpoke Well e Azalea', 'johto', ['slowpoke-well-1f', 'slowpoke-well-b1f', 'azalea-town-area'], [8, 11], 10),
  gym('bugsy', 'johto', { title: 'Líder', name: 'Bugsy', team: [[11, 14], [14, 14], [123, 16]], reward: 1600, badge: 'Hive' }),
  route('ilex', 'Ilex Forest', 'johto', ['ilex-forest-area'], [10, 13], 10, {
    events: [{ id: 'celebi', species: 251, level: 60, p: 0.03, requires: { defeated: 'red' } }]
  }),
  route('r34', 'Rota 34 e Goldenrod', 'johto', ['johto-route-34-area'], [12, 15], 10, {
    extras: [...BABIES, { species: 133, p: 0.006 }]
  }),
  gym('whitney', 'johto', { title: 'Líder', name: 'Whitney', team: [[35, 18], [241, 20]], reward: 2000, badge: 'Plain' }),
  route('r35', 'Rota 35 e National Park', 'johto', ['johto-route-35-area', 'national-park-area'], [13, 16], 10, {
    extras: [
      { species: 123, p: 0.008 },
      { species: 127, p: 0.008 }
    ]
  }),
  route('r36', 'Rotas 36 e 37', 'johto', ['johto-route-36-area', 'johto-route-37-area'], [14, 18], 10, {
    events: [{ id: 'sudowoodo', species: 185, level: 20, p: 0.04 }]
  }),
  route('burned', 'Burned Tower e Ecruteak', 'johto', ['burned-tower-1f', 'burned-tower-b1f', 'ecruteak-city-area'], [16, 19], 10),
  gym('morty', 'johto', { title: 'Líder', name: 'Morty', team: [[92, 21], [93, 21], [93, 23], [94, 25]], reward: 2500, badge: 'Fog' }),
  route('r38', 'Rotas 38 e 39', 'johto', ['johto-route-38-area', 'johto-route-39-area'], [17, 21], 10),
  route(
    'olivine',
    'Olivine, Cianwood e Whirl Islands',
    'johto',
    ['olivine-city-area', 'johto-sea-route-40-area', 'johto-sea-route-41-area', 'whirl-islands-1f', 'whirl-islands-b1f', 'whirl-islands-b3f', 'cianwood-city-area'],
    [20, 25],
    12
  ),
  gym('chuck', 'johto', { title: 'Líder', name: 'Chuck', team: [[57, 27], [62, 30]], reward: 3000, badge: 'Storm' }),
  gym('jasmine', 'johto', { title: 'Líder', name: 'Jasmine', team: [[81, 30], [81, 30], [208, 35]], reward: 3500, badge: 'Mineral' }),
  route('mortar', 'Rota 42 e Mt. Mortar', 'johto', ['johto-route-42-area', 'mt-mortar-1f', 'mt-mortar-b1f', 'mt-mortar-upper-cave', 'mt-mortar-lower-cave'], [22, 26], 12, {
    extras: [{ species: 236, p: 0.01 }]
  }),
  route('rage', 'Rota 43 e Lake of Rage', 'johto', ['johto-route-43-area', 'lake-of-rage-area'], [24, 28], 10, {
    events: [{ id: 'red-gyarados', species: 130, level: 30, p: 0.05, shiny: true }]
  }),
  route('rocket', 'Esconderijo da Equipe Rocket', 'johto', ['team-rocket-hq-area'], [25, 29], 8, {
    custom: [[109, 30], [100, 25], [74, 15], [41, 15], [88, 10], [24, 5], [20, 10]]
  }),
  gym('pryce', 'johto', { title: 'Líder', name: 'Pryce', team: [[86, 27], [87, 29], [221, 31]], reward: 3100, badge: 'Glacier' }),
  route('icepath', 'Ice Path', 'johto', ['ice-path-1f', 'ice-path-b1f', 'ice-path-b2f', 'ice-path-b3f'], [27, 31], 10),
  gym('clair', 'johto', { title: 'Líder', name: 'Clair', team: [[148, 37], [148, 37], [148, 37], [230, 40]], reward: 4000, badge: 'Rising' }),
  route('dragonsden', "Dragon's Den e Rota 44", 'johto', ['dragons-den-area', 'johto-route-44-area', 'blackthorn-city-area'], [29, 33], 12, {
    extras: [{ species: 147, p: 0.02 }]
  }),
  route('r45', 'Rotas 45 e 46', 'johto', ['johto-route-45-area', 'johto-route-46-area', 'dark-cave-blackthorn-city-entrance'], [31, 35], 12),
  route('whirldeep', 'Fundo das Whirl Islands', 'johto', ['whirl-islands-b2f', 'union-cave-b2f'], [32, 36], 10, {
    events: [
      { id: 'lugia', species: 249, level: 45, p: 0.05 },
      { id: 'lapras', species: 131, level: 30, p: 0.08, requires: { friday: true } }
    ]
  }),
  route('r27', 'Rotas 26 e 27 e Tohjo Falls', 'johto', ['kanto-route-27-area', 'tohjo-falls-area', 'kanto-route-26-area'], [34, 38], 12),
  route('victory', 'Victory Road', 'johto', ['kanto-victory-road-1-1f', 'kanto-victory-road-1-2f', 'kanto-victory-road-1-3f'], [36, 40], 12, {
    events: [{ id: 'moltres', species: 146, level: 72, p: 0.04, requires: { defeated: 'blue' } }]
  }),
  gym('will', 'johto', { title: 'Elite 4', name: 'Will', team: [[178, 40], [124, 41], [103, 41], [80, 41], [178, 42]], reward: 4200 }, 'elite'),
  gym('koga', 'johto', { title: 'Elite 4', name: 'Koga', team: [[168, 40], [49, 41], [205, 43], [89, 42], [169, 44]], reward: 4400 }, 'elite'),
  gym('bruno', 'johto', { title: 'Elite 4', name: 'Bruno', team: [[237, 42], [106, 42], [107, 42], [95, 43], [68, 46]], reward: 4600 }, 'elite'),
  gym('karen', 'johto', { title: 'Elite 4', name: 'Karen', team: [[197, 42], [45, 42], [198, 44], [94, 45], [229, 47]], reward: 4700 }, 'elite'),
  gym(
    'lance',
    'johto',
    {
      title: 'Campeão',
      name: 'Lance',
      team: [[130, 44], [149, 47], [149, 47], [142, 46], [6, 46], [149, 50]],
      reward: 10000,
      prize: 'master-ball'
    },
    'champion'
  ),
  route(
    'belltower',
    'Bell Tower',
    'johto',
    ['bell-tower-2f', 'bell-tower-3f', 'bell-tower-4f', 'bell-tower-5f', 'bell-tower-6f', 'bell-tower-7f', 'bell-tower-8f', 'bell-tower-9f'],
    [44, 48],
    10,
    { events: [{ id: 'ho-oh', species: 250, level: 55, p: 0.05 }] }
  ),
  // ------------------------------------------------------------------ KANTO
  route(
    'vermilion',
    'Vermilion, Rotas 6 e 11',
    'kanto',
    ['vermilion-city-area', 'vermilion-city-ss-anne-dock', 'kanto-route-6-area', 'kanto-route-11-area', 'digletts-cave-area'],
    [48, 52],
    12,
    { extras: [{ species: 7, p: 0.005 }], events: [{ id: 'snorlax', species: 143, level: 55, p: 0.05 }] }
  ),
  gym('surge', 'kanto', { title: 'Líder', name: 'Lt. Surge', team: [[26, 56], [101, 53], [82, 53], [101, 53], [125, 57]], reward: 5700, badge: 'Thunder' }),
  route('saffron', 'Rotas 5, 7 e 8', 'kanto', ['kanto-route-5-area', 'kanto-route-7-area', 'kanto-route-8-area'], [51, 55], 12),
  gym('sabrina', 'kanto', { title: 'Líder', name: 'Sabrina', team: [[196, 58], [122, 58], [65, 60]], reward: 6000, badge: 'Marsh' }),
  route('celadon', 'Celadon e Rotas 16 a 18', 'kanto', ['celadon-city-area', 'kanto-route-16-area', 'kanto-route-17-area', 'kanto-route-18-area'], [54, 58], 12, {
    extras: [{ species: 137, p: 0.006 }]
  }),
  gym('erika', 'kanto', { title: 'Líder', name: 'Erika', team: [[114, 59], [189, 59], [71, 61], [182, 62]], reward: 6200, badge: 'Rainbow' }),
  route(
    'fuchsia',
    'Fuchsia e Rotas 12 a 15',
    'kanto',
    ['fuchsia-city-area', 'kanto-route-12-area', 'kanto-route-13-area', 'kanto-route-14-area', 'kanto-route-15-area'],
    [57, 61],
    12
  ),
  gym('janine', 'kanto', { title: 'Líder', name: 'Janine', team: [[169, 63], [110, 62], [168, 61], [168, 61], [49, 64]], reward: 6400, badge: 'Soul' }),
  route(
    'cerulean',
    'Cerulean, Rock Tunnel e Power Plant',
    'kanto',
    ['kanto-route-9-area', 'kanto-route-10-area', 'rock-tunnel-1f', 'rock-tunnel-b1f', 'kanto-route-24-area', 'kanto-route-25-area', 'cerulean-city-area', 'kanto-power-plant-area'],
    [60, 64],
    14,
    {
      extras: [
        { species: 1, p: 0.005 },
        { species: 4, p: 0.005 }
      ],
      events: [{ id: 'zapdos', species: 145, level: 62, p: 0.04 }]
    }
  ),
  gym('misty', 'kanto', { title: 'Líder', name: 'Misty', team: [[55, 65], [195, 65], [131, 66], [121, 68]], reward: 6800, badge: 'Cascade' }),
  route('pewter', 'Mt. Moon, Rotas 3 e 4', 'kanto', ['mt-moon-1f', 'kanto-route-3-area', 'kanto-route-4-area', 'pewter-city-area'], [63, 67], 12, {
    extras: [
      { species: 138, p: 0.006 },
      { species: 140, p: 0.006 },
      { species: 142, p: 0.004 }
    ]
  }),
  gym('brock', 'kanto', { title: 'Líder', name: 'Brock', team: [[76, 68], [112, 68], [139, 69], [208, 70], [141, 69]], reward: 7000, badge: 'Boulder' }),
  route(
    'cinnabar',
    'Rotas 1, 19 a 21 e Cinnabar',
    'kanto',
    ['kanto-sea-route-19-area', 'kanto-sea-route-20-area', 'kanto-sea-route-21-area', 'cinnabar-island-area', 'pallet-town-area', 'kanto-route-1-area'],
    [66, 70],
    14,
    { events: [{ id: 'articuno', species: 144, level: 66, p: 0.04 }] }
  ),
  gym('blaine', 'kanto', { title: 'Líder', name: 'Blaine', team: [[219, 71], [126, 71], [78, 73]], reward: 7300, badge: 'Volcano' }),
  route(
    'viridian',
    'Viridian, Rotas 2, 22 e 28',
    'kanto',
    ['viridian-city-area', 'kanto-route-2-south-towards-viridian-city', 'kanto-route-22-area', 'kanto-route-28-area'],
    [69, 73],
    14
  ),
  gym('blue', 'kanto', { title: 'Líder', name: 'Blue', team: [[18, 74], [65, 74], [112, 75], [130, 75], [103, 75], [59, 76]], reward: 7600, badge: 'Earth' }),
  route('silver', 'Mt. Silver', 'kanto', ['mt-silver-outside', 'mt-silver-1f', 'mt-silver-2f', 'mt-silver-top'], [72, 78], 16),
  gym('red', 'kanto', { title: 'Treinador', name: 'Red', team: [[25, 88], [196, 82], [143, 84], [3, 85], [6, 85], [9, 85]], reward: 20000 }, 'champion'),
  // ---------------------------------------------------------- pós-jogo
  route('ceruleancave', 'Cerulean Cave', 'kanto', ['mt-silver-2f', 'kanto-victory-road-1-3f', 'rock-tunnel-b1f'], [80, 85], 12, {
    events: [{ id: 'mewtwo', species: 150, level: 85, p: 0.04 }]
  }),
  route('faraway', 'Ilha Distante', 'kanto', ['ilex-forest-area', 'national-park-area'], [82, 88], 12, {
    events: [{ id: 'mew', species: 151, level: 80, p: 0.03 }]
  })
]

/** Raikou, Entei e Suicune vagam por Johto depois da 4ª insígnia. */
export const ROAMING = { species: [243, 244, 245], level: 40, p: 1 / 300, minBadges: 4 }

export const zoneById = (id: string): Zone | undefined => ZONES.find((z) => z.id === id)
export const zoneIndex = (id: string): number => ZONES.findIndex((z) => z.id === id)

// ------------------------------------------------------------ hora do dia

export type TimeOfDay = 'morning' | 'day' | 'night'
/** Gen 2: manhã 4–10h, dia 10–18h, noite 18–4h (relógio real). */
export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours()
  if (h >= 4 && h < 10) return 'morning'
  if (h >= 10 && h < 18) return 'day'
  return 'night'
}

// ------------------------------------------------------------ encontros

const METHOD_WEIGHT: Record<string, number> = {
  walk: 1,
  surf: 0.35,
  'old-rod': 0.12,
  'good-rod': 0.12,
  'super-rod': 0.12,
  'headbutt-low': 0.05,
  'headbutt-normal': 0.05,
  'headbutt-high': 0.05,
  'rock-smash': 0.15
}

// ------------------------------------------------------------ nível mínimo por espécie

const minLevelCache = new Map<number, number>()
/** Nível mínimo plausível da espécie (pela cadeia de evolução). */
export function minLevel(id: number): number {
  const hit = minLevelCache.get(id)
  if (hit !== undefined) return hit
  const sp = species(id)
  let lv = 1
  if (sp.evolvesFrom) {
    const pre = species(sp.evolvesFrom)
    const base = minLevel(pre.id)
    const evo = pre.evolutions.find((e) => e.to === id)
    if (evo && 'level' in evo) lv = Math.max(evo.level, base + 1)
    else lv = Math.max(base + 10, 25) // pedra/item
  }
  minLevelCache.set(id, lv)
  return lv
}

/** Troca a espécie pela pré-evolução enquanto o nível for baixo demais para ela. */
export function fitSpecies(id: number, level: number): number {
  let cur = id
  while (minLevel(cur) > level && species(cur).evolvesFrom) cur = species(cur).evolvesFrom as number
  return cur
}

export interface PoolEntry {
  species: number
  weight: number
  fished: boolean
}

/** Pool de encontros da zona para a hora atual (sem extras/eventos). */
export function zonePool(zone: Zone, tod: TimeOfDay = timeOfDay(), friday = new Date().getDay() === 5): PoolEntry[] {
  const best = new Map<string, PoolEntry>()
  for (const area of zone.areas) {
    for (const row of ENCOUNTERS[area] ?? []) {
      const mw = METHOD_WEIGHT[row.method]
      if (mw === undefined) continue
      let factor = 1
      let ok = true
      for (const c of row.conditions) {
        if (c.startsWith('time-')) {
          if (c !== `time-${tod}`) ok = false
        } else if (c === 'swarm-yes') factor *= 0.15
        else if (c === 'swarm-no') factor *= 1
        else if (c === 'weekday-friday') {
          if (!friday) ok = false
        } else ok = false // troca, cassino, eventos de história etc.
      }
      if (!ok) continue
      const sp = fitSpecies(row.species, zone.levels[1])
      const key = `${sp}|${row.method}|${row.conditions.join(',')}`
      const weight = mw * row.chance * factor
      const prev = best.get(key)
      if (!prev || prev.weight < weight) best.set(key, { species: sp, weight, fished: row.method.endsWith('rod') })
    }
  }
  for (const [sp, w] of zone.custom ?? []) best.set(`custom|${sp}`, { species: sp, weight: w, fished: false })
  return [...best.values()]
}

/** Todas as espécies que podem aparecer na zona (qualquer hora), para a Pokédex. */
export function zoneSpecies(zone: Zone): number[] {
  const set = new Set<number>()
  for (const tod of ['morning', 'day', 'night'] as TimeOfDay[]) {
    for (const e of zonePool(zone, tod, true)) set.add(e.species)
  }
  for (const x of zone.extras ?? []) set.add(x.species)
  for (const ev of zone.events ?? []) set.add(ev.species)
  if (zone.trainer) for (const [s] of zone.trainer.team) set.add(s)
  return [...set]
}

export function rollPool(pool: PoolEntry[], boostType?: string): PoolEntry | null {
  return weighted(pool, (e) => e.weight * (boostType && species(e.species).types.includes(boostType as never) ? 2 : 1))
}

// ------------------------------------------------------------ treinadores de rota

const TRAINER_CLASSES = [
  'Jovem', 'Garota', 'Observador de Pássaros', 'Pescador', 'Montanhista', 'Caçador de Insetos', 'Médium',
  'Nadador', 'Montanhista', 'Supernerd', 'Motoqueiro', 'Lutador', 'Ruiva', 'Sábio', 'Domador', 'Mergulhadora'
]
const TRAINER_NAMES = [
  'Joey', 'Mikey', 'Albert', 'Gordon', 'Ralph', 'Anthony', 'Wade', 'Beth', 'Liz', 'Gina', 'Erin', 'Todd',
  'Kenji', 'Ronald', 'Parry', 'Dana', 'Tully', 'Wilton', 'Huey', 'Jack', 'Alan', 'Chad', 'Vance', 'Brent'
]
export const randomTrainerLabel = (): string =>
  `${TRAINER_CLASSES[Math.floor(Math.random() * TRAINER_CLASSES.length)]} ${TRAINER_NAMES[Math.floor(Math.random() * TRAINER_NAMES.length)]}`
