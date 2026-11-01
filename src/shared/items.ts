// Loja e itens (D9). Nomes de itens em inglês (oficiais), descrições em pt-BR.
import { BALANCE } from './balance'

export type ItemKind = 'ball' | 'potion' | 'revive' | 'evo'

export interface ShopItem {
  slug: string
  name: string
  kind: ItemKind
  price: number
  /** Insígnias necessárias para aparecer à venda. */
  badges: number
  desc: string
  heal?: number
}

export const SHOP: ShopItem[] = [
  { slug: 'poke-ball', name: 'Poké Ball', kind: 'ball', price: 200, badges: 0, desc: 'Bola básica (×1).' },
  { slug: 'great-ball', name: 'Great Ball', kind: 'ball', price: 600, badges: 2, desc: 'Captura melhor (×1,5).' },
  { slug: 'ultra-ball', name: 'Ultra Ball', kind: 'ball', price: 1200, badges: 4, desc: 'Captura bem melhor (×2).' },
  { slug: 'level-ball', name: 'Level Ball', kind: 'ball', price: 500, badges: 1, desc: 'Ótima se seu Pokémon tiver nível maior que o alvo (até ×8).' },
  { slug: 'fast-ball', name: 'Fast Ball', kind: 'ball', price: 500, badges: 1, desc: '×4 em Pokémon com Velocidade base 100+.' },
  { slug: 'lure-ball', name: 'Lure Ball', kind: 'ball', price: 500, badges: 1, desc: '×5 em Pokémon fisgados com vara.' },
  { slug: 'heavy-ball', name: 'Heavy Ball', kind: 'ball', price: 500, badges: 1, desc: 'Melhor quanto mais pesado o alvo; ruim nos leves.' },
  { slug: 'moon-ball', name: 'Moon Ball', kind: 'ball', price: 500, badges: 1, desc: '×4 em Pokémon que evoluem com Moon Stone.' },
  { slug: 'love-ball', name: 'Love Ball', kind: 'ball', price: 500, badges: 1, desc: '×8 se o alvo for da mesma espécie e gênero oposto ao seu Pokémon ativo.' },
  { slug: 'friend-ball', name: 'Friend Ball', kind: 'ball', price: 150, badges: 1, desc: 'Bola barata (×1).' },
  { slug: 'potion', name: 'Potion', kind: 'potion', price: 300, badges: 0, heal: 20, desc: 'Recupera 20 HP. Usada sozinha quando o HP fica baixo.' },
  { slug: 'super-potion', name: 'Super Potion', kind: 'potion', price: 700, badges: 2, heal: 60, desc: 'Recupera 60 HP.' },
  { slug: 'hyper-potion', name: 'Hyper Potion', kind: 'potion', price: 1200, badges: 5, heal: 120, desc: 'Recupera 120 HP.' },
  { slug: 'revive', name: 'Revive', kind: 'revive', price: 1500, badges: 3, desc: 'Reanima um Pokémon desmaiado com metade do HP. Usado sozinho após a batalha.' },
  { slug: 'fire-stone', name: 'Fire Stone', kind: 'evo', price: 2100, badges: 3, desc: 'Evolui certos Pokémon (ex.: Vulpix, Growlithe, Eevee).' },
  { slug: 'water-stone', name: 'Water Stone', kind: 'evo', price: 2100, badges: 3, desc: 'Evolui certos Pokémon (ex.: Poliwhirl, Shellder, Staryu, Eevee).' },
  { slug: 'thunder-stone', name: 'Thunder Stone', kind: 'evo', price: 2100, badges: 3, desc: 'Evolui certos Pokémon (ex.: Pikachu, Eevee).' },
  { slug: 'leaf-stone', name: 'Leaf Stone', kind: 'evo', price: 2100, badges: 3, desc: 'Evolui certos Pokémon (ex.: Gloom, Weepinbell, Exeggcute).' },
  { slug: 'moon-stone', name: 'Moon Stone', kind: 'evo', price: 2100, badges: 3, desc: 'Evolui certos Pokémon (ex.: Clefairy, Jigglypuff, Nidorino).' },
  { slug: 'sun-stone', name: 'Sun Stone', kind: 'evo', price: 2100, badges: 3, desc: 'Evolui certos Pokémon (ex.: Gloom → Bellossom, Sunkern).' },
  { slug: 'metal-coat', name: 'Metal Coat', kind: 'evo', price: 3000, badges: 6, desc: 'Evolui Onix e Scyther (substitui a troca).' },
  { slug: 'dragon-scale', name: 'Dragon Scale', kind: 'evo', price: 3000, badges: 6, desc: 'Evolui Seadra (substitui a troca).' },
  { slug: 'kings-rock', name: "King's Rock", kind: 'evo', price: 3000, badges: 6, desc: 'Evolui Poliwhirl e Slowpoke (substitui a troca).' },
  { slug: 'up-grade', name: 'Up-Grade', kind: 'evo', price: 3000, badges: 6, desc: 'Evolui Porygon (substitui a troca).' }
]

export const MASTER_BALL: ShopItem = {
  slug: 'master-ball',
  name: 'Master Ball',
  kind: 'ball',
  price: 0,
  badges: 99,
  desc: 'Captura garantida. Prêmio da Elite 4.'
}

const BY_SLUG = new Map([...SHOP, MASTER_BALL].map((i) => [i.slug, i]))
export const itemInfo = (slug: string): ShopItem | undefined => BY_SLUG.get(slug)
export const itemName = (slug: string): string => BY_SLUG.get(slug)?.name ?? slug

export const BALLS = [...SHOP, MASTER_BALL].filter((i) => i.kind === 'ball').map((i) => i.slug)
export const POTIONS = SHOP.filter((i) => i.kind === 'potion')

// ------------------------------------------------------------ dinheiro

export const START_MONEY = 3000

/** Dinheiro por vitória contra selvagem (D9: "selvagem dá pouco"). */
export const wildMoney = BALANCE.wildMoney
/** Dinheiro por treinador de rota (base × nível do último Pokémon, como nos jogos). */
export const trainerMoney = BALANCE.trainerMoney
/** Dinheiro ao soltar um Pokémon (D9). */
export function releaseMoney(level: number, ivPct: number, shiny: boolean): number {
  return Math.round(40 + level * 6 + ivPct * 3 + (shiny ? 1000 : 0))
}
