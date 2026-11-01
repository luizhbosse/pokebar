// Confere se as 251 espécies são obteníveis pelo mapa (selvagem, extra, evento, errante, inicial ou evolução).
import { SPECIES } from '../src/shared/data'
import { ROAMING, ZONES, zoneSpecies } from '../src/shared/world'
import { STARTERS } from '../src/shared/game'

const ok = new Set<number>(STARTERS)
for (const z of ZONES) if (!z.trainer) for (const s of zoneSpecies(z)) ok.add(s)
for (const s of ROAMING.species) ok.add(s)
let changed = true
while (changed) {
  changed = false
  for (const sp of SPECIES) for (const e of sp.evolutions) if (ok.has(sp.id) && !ok.has(e.to)) { ok.add(e.to); changed = true }
}
const missing = SPECIES.filter((s) => !ok.has(s.id))
console.log(`Obteníveis: ${ok.size}/251`)
console.log('Faltando:', missing.map((s) => `${s.id} ${s.name}`).join(', ') || 'nenhuma')
for (const z of ZONES) if (!z.trainer && zoneSpecies(z).length === 0) console.log('Zona sem encontros:', z.id)
