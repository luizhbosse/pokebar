import type { PokebarApi } from '../../preload'

declare global {
  interface Window {
    pokebar: PokebarApi
  }
}

export {}
