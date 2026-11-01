// Aleatoriedade. Math.random basta para um jogo pessoal; centralizado para facilitar testes.

export const rand = (): number => Math.random()
export const randInt = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1))
export const chance = (p: number): boolean => Math.random() < p
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

/** Sorteio ponderado. */
export function weighted<T>(items: readonly T[], weight: (t: T) => number): T | null {
  let total = 0
  for (const it of items) total += Math.max(0, weight(it))
  if (total <= 0) return null
  let r = Math.random() * total
  for (const it of items) {
    r -= Math.max(0, weight(it))
    if (r < 0) return it
  }
  return items[items.length - 1] ?? null
}

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
