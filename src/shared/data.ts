// Acesso tipado aos dados gerados pela PokeAPI.
import speciesJson from './data/species.json'
import movesJson from './data/moves.json'
import abilitiesJson from './data/abilities.json'
import encountersJson from './data/encounters.json'
import itemsJson from './data/items.json'
import type { Ability, EncounterRow, ItemData, Move, Species } from './types'

export const SPECIES = speciesJson as unknown as Species[]
export const MOVES = movesJson as unknown as Record<string, Move>
export const ABILITIES = abilitiesJson as unknown as Record<string, Ability>
export const ENCOUNTERS = encountersJson as unknown as Record<string, EncounterRow[]>
export const ITEM_DATA = itemsJson as unknown as Record<string, ItemData>

export const MAX_SPECIES = SPECIES.length

// Pré-evoluções de gerações futuras (ex.: Munchlax → Snorlax, Azurill → Marill) ficam de fora.
for (const s of SPECIES) if (s.evolvesFrom && s.evolvesFrom > MAX_SPECIES) s.evolvesFrom = null

export function species(id: number): Species {
  const s = SPECIES[id - 1]
  if (!s) throw new Error(`espécie inválida: ${id}`)
  return s
}
