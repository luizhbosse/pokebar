// Simulação sem tela: um "jogador automático" joga do início ao fim e mede a curva.
// Uso: npx tsx scripts/sim.ts [starterId] [maxBattles]
import { Game } from '../src/shared/game'
import { newGame, currentZone } from '../src/shared/state'
import { SHOP } from '../src/shared/items'
import { species } from '../src/shared/data'
import { ZONES } from '../src/shared/world'
import type { OwnedMon } from '../src/shared/types'

const starter = Number(process.argv[2] ?? 155)
const maxBattles = Number(process.argv[3] ?? 60000)
const g = new Game(newGame())
g.chooseStarter(starter)
const s = g.state

const bst = (m: OwnedMon) => Object.values(species(m.species).baseStats).reduce((a, b) => a + b, 0)
const power = (m: OwnedMon) => m.level * 10 + bst(m) / 6

function shop() {
  const unlocked = SHOP.filter((i) => i.badges <= s.badges.length)
  const best = (kind: string) => unlocked.filter((i) => i.kind === kind && (kind !== 'ball' || ['poke-ball', 'great-ball', 'ultra-ball'].includes(i.slug))).pop()
  const ball = best('ball')
  const potion = best('potion')
  const balls = ['poke-ball', 'great-ball', 'ultra-ball'].reduce((a, b) => a + (s.items[b] ?? 0), 0)
  if (ball && balls < 5 && s.money >= ball.price * 5 + 300) g.buy(ball.slug, 5)
  if (potion && (s.items[potion.slug] ?? 0) < 3 && s.money >= potion.price * 2 + 600) g.buy(potion.slug, 2)
  if (s.badges.length >= 3 && (s.items['revive'] ?? 0) < 2 && s.money >= 4000) g.buy('revive', 1)
}

function manageTeam() {
  const all = [...s.party, ...s.box].sort((a, b) => power(b) - power(a))
  const top = all.slice(0, 6)
  s.party = top
  s.box = all.slice(6)
}

let turns = 0
let wipes = 0
let battles = 0
const reached: Record<string, number> = {}
const startTime = Date.now()
let lastZone = ''
while (battles < maxBattles) {
  shop()
  const enc = g.nextEncounter()
  if (!enc) { console.log('SEM ENCONTRO em', s.zone); break }
  g.start()
  let guard = 0
  while (!enc.battle.ended && guard++ < 200) { g.turn(); turns++ }
  const ended = enc.battle.ended
  if (ended === 'lose') wipes++
  g.finish()
  battles++
  if (ended === 'caught') manageTeam()
  if (s.zone !== lastZone) { lastZone = s.zone; if (!(s.zone in reached)) reached[s.zone] = battles }
  if (s.defeated.includes('faraway') || (s.zone === 'faraway' && s.progress['faraway']?.cleared)) break
}
// Tempo estimado: 2,5s de caminhada + 1,7s por turno.
const hours = (battles * 2.5 + turns * 1.7) / 3600
console.log(`Inicial: ${species(starter).name} · batalhas: ${battles} · turnos/batalha: ${(turns / battles).toFixed(1)} · derrotas: ${wipes}`)
console.log(`Tempo estimado de jogo: ${hours.toFixed(1)} h · capturados: ${s.stats.caught} · dex: ${Object.values(s.dex).filter((d) => d.caught).length} · dinheiro: ${s.money}`)
console.log('Chegada em cada líder (batalha nº → h estimada):')
let line = ''
for (const z of ZONES) if (z.trainer && reached[z.id]) line += `${z.id}@${reached[z.id]}(${((reached[z.id] * (2.5 + 1.7 * turns / battles)) / 3600).toFixed(1)}h) `
console.log(line)
console.log('Badges:', s.badges.length, '· zona final:', currentZone(s).name)
console.log('Time:', s.party.map((m) => `${species(m.species).name} L${m.level}`).join(', '))
console.log(`(simulação levou ${((Date.now() - startTime) / 1000).toFixed(1)}s)`)
