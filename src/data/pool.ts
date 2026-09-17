import raw from "./pool-defaults.json"

export type PoolHeroDefault = {
  rating: string
  enabled: boolean
}

export type PoolDefaults = {
  version: string
  hash: string
  heroes: Record<string, PoolHeroDefault>
  maps: Record<string, boolean>
}

export const poolDefaults = raw as PoolDefaults
export const POOL_VERSION = poolDefaults.version
