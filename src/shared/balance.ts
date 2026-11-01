// Ritmo do jogo. Meta: 1º ginásio ~1h, Clair ~15h, Lance ~25h, Red ~50h de jogo rodando (premissa ajustável).
// Medido com scripts/sim.ts (6 iniciais): Falkner ~1h, Clair 8–14h, Lance 18–35h, Red 31–80h.

export const BALANCE = {
  /** Multiplicador da experiência ganha (fórmula oficial × isto). */
  expRate: 0.05,
  /** Multiplicador das vitórias necessárias para concluir cada rota. */
  routeWinsMult: 9,
  /** Dinheiro por selvagem derrotado. */
  wildMoney: (level: number): number => 2 * level + 4,
  /** Dinheiro por treinador de rota. */
  trainerMoney: (level: number, count: number): number => 8 * level * count,
  /** Vitórias extras na rota antes de tentar o líder de novo depois de perder. */
  gymRetryWins: 20
}
