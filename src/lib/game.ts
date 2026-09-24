import { TIER_RANK, TIER_SCORE, createHeroes, portraitUrl, type Hero, type Role, type Tier } from "../data/heroes"
import { MODE_ORDER, createMaps, type GameMap } from "../data/maps"
import { POOL_VERSION } from "../data/pool"

export type Player = { name: string; hero: string; role: Role }
export type Team = Player[]
export type Format = 5 | 6
export type Rules = {
  balanceRoles: boolean
  allowRepeat: boolean
  allowReroll: boolean
  balanceRatings: boolean
  cycleHeroes: boolean
  cycleMaps: boolean
  cycleRoles: boolean
  rolesOnly: boolean
  teamsOnly: boolean
  allowPrefRoles: boolean
  allowPrefHeroes: boolean
  allowPrefAlly: boolean
  allowPrefAvoid: boolean
}
export type AuditItem = {
  time: string
  text: string
  from?: string
  to?: string
}
export type Match = {
  format: Format
  map: GameMap
  teams: [Team, Team]
  audit: AuditItem[]
  rolesOnly: boolean
  teamsOnly: boolean
}

export const ALL_ROLES: Role[] = ["坦克", "输出", "支援"]
export const STORE_KEY = "OwRandomizer"
const RATE_TRIES = 360

export type SessionDraw = {
  heroCount: Record<string, number>
  mapBag: string[]
  roleCount: Record<string, Partial<Record<Role, number>>>
}

export function emptySession(): SessionDraw {
  return { heroCount: {}, mapBag: [], roleCount: {} }
}

function personKey(entry: RosterEntry, index: number) {
  return seatedPlayerId(entry) || resolveSeatName(entry, index)
}

function leastSeenRole(roles: Role[], count?: Partial<Record<Role, number>>): Role {
  if (!roles.length) return randomItem(ALL_ROLES)
  if (!count) return randomItem(roles)
  let min = Infinity
  roles.forEach((role) => {
    const n = count[role] || 0
    if (n < min) min = n
  })
  return randomItem(roles.filter((role) => (count[role] || 0) === min))
}

function roleCycleCost(seats: { role: Role; entry: RosterEntry; index: number }[], session?: SessionDraw) {
  if (!session) return 0
  return seats.reduce((sum, seat) => sum + (session.roleCount[personKey(seat.entry, seat.index)]?.[seat.role] || 0), 0)
}

export type RosterEntry = {
  name: string
  roles: Role[]
  open: boolean
  ally: number[]
  avoid: number[]
  heroes: string[]
  heroNone: boolean
  playerId: string
}

export const ROSTER_CAP = 12

export function emptySeat(): RosterEntry {
  return { name: "", roles: [...ALL_ROLES], open: true, ally: [], avoid: [], heroes: [], heroNone: false, playerId: "" }
}

export function seatLabel(index: number) {
  return `玩家${String(index + 1).padStart(2, "0")}`
}

export function resolveSeatName(entry: Pick<RosterEntry, "name">, index: number) {
  return entry.name.trim() || seatLabel(index)
}

export function parseRosterEntry(raw: unknown): RosterEntry {
  if (typeof raw === "string") {
    const name = raw.slice(0, 16)
    return { name, roles: [...ALL_ROLES], open: Boolean(name.trim()), ally: [], avoid: [], heroes: [], heroNone: false, playerId: "" }
  }
  if (!raw || typeof raw !== "object") return emptySeat()
  const row = raw as { name?: unknown; roles?: unknown; open?: unknown; ally?: unknown; avoid?: unknown; heroes?: unknown; heroNone?: unknown; playerId?: unknown }
  const name = typeof row.name === "string" ? row.name.slice(0, 16) : ""
  const listed = Array.isArray(row.roles) ? row.roles : null
  const roles = listed ? ALL_ROLES.filter((role) => listed.includes(role)) : [...ALL_ROLES]
  const open = row.open === true || Boolean(name.trim())
  const ids = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < ROSTER_CAP))]
    : []
  const heroes = Array.isArray(row.heroes)
    ? [...new Set(row.heroes.filter((item): item is string => typeof item === "string" && item.length > 0))]
    : []
  const playerId = typeof row.playerId === "string" ? row.playerId : ""
  return { name, roles, open, ally: ids(row.ally), avoid: ids(row.avoid), heroes, heroNone: row.heroNone === true, playerId }
}

export function revealSeats(roster: RosterEntry[], format: Format) {
  return roster.map((entry, index) => (index < format * 2 ? { ...entry, open: true } : entry))
}

export function padRoster(roster: RosterEntry[]): RosterEntry[] {
  const next = roster.slice(0, ROSTER_CAP).map((row, index) => {
    const entry = parseRosterEntry(row)
    const ally = entry.ally.filter((item) => item !== index)
    const avoid = entry.avoid.filter((item) => item !== index)
    if (entry.name === seatLabel(index)) return { ...entry, name: "", ally, avoid }
    return { ...entry, ally, avoid }
  })
  while (next.length < ROSTER_CAP) next.push(emptySeat())
  return exclusiveRoster(next)
}

function exclusiveRoster(roster: RosterEntry[]): RosterEntry[] {
  const next = roster.map((entry) => ({
    ...entry,
    ally: [...entry.ally],
    avoid: [...entry.avoid],
  }))
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const avoided = next[i].avoid.includes(j) || next[j].avoid.includes(i)
      const allied = next[i].ally.includes(j) || next[j].ally.includes(i)
      if (!avoided || !allied) continue
      next[i].ally = next[i].ally.filter((item) => item !== j)
      next[j].ally = next[j].ally.filter((item) => item !== i)
    }
  }
  return next
}

export type PlayerProfile = {
  id: string
  name: string
  roles: Role[]
  heroes: string[]
  heroNone: boolean
  ally: string[]
  avoid: string[]
  seen: number
  created: number
}

function uniqueNames(names: string[], self = "") {
  return [...new Set(names.map((item) => item.trim()).filter((item) => item && item !== self))]
}

export function newPlayerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatFavoriteDate(ts: number) {
  if (!ts) return ""
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(ts))
}

export function seatedName(entry: Pick<RosterEntry, "name" | "open">, index: number) {
  if (!entry.open) return ""
  const name = entry.name.trim()
  if (!name || name === seatLabel(index)) return ""
  return name
}

export function seatedPlayerId(entry: Pick<RosterEntry, "open" | "playerId">) {
  return entry.open && entry.playerId ? entry.playerId : ""
}

export function emptyProfile(name: string): PlayerProfile {
  const now = Date.now()
  return {
    id: newPlayerId(),
    name: name.trim().slice(0, 16),
    roles: [...ALL_ROLES],
    heroes: [],
    heroNone: false,
    ally: [],
    avoid: [],
    seen: now,
    created: now,
  }
}

export function parsePlayerProfile(raw: unknown): PlayerProfile | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as { id?: unknown; name?: unknown; roles?: unknown; heroes?: unknown; heroNone?: unknown; ally?: unknown; avoid?: unknown; seen?: unknown; created?: unknown }
  const name = typeof row.name === "string" ? row.name.trim().slice(0, 16) : ""
  if (!name) return null
  const listed = Array.isArray(row.roles) ? row.roles : null
  const roles = listed ? ALL_ROLES.filter((role) => listed.includes(role)) : [...ALL_ROLES]
  const heroes = Array.isArray(row.heroes)
    ? [...new Set(row.heroes.filter((item): item is string => typeof item === "string" && item.length > 0))]
    : []
  const refs = (value: unknown) => Array.isArray(value)
    ? uniqueNames(value.filter((item): item is string => typeof item === "string"))
    : []
  const seen = typeof row.seen === "number" && Number.isFinite(row.seen) ? row.seen : 0
  const created = typeof row.created === "number" && Number.isFinite(row.created) ? row.created : seen
  const id = typeof row.id === "string" && row.id ? row.id : ""
  return {
    id,
    name,
    roles,
    heroes,
    heroNone: row.heroNone === true,
    ally: refs(row.ally),
    avoid: refs(row.avoid),
    seen,
    created: created || Date.now(),
  }
}

function exclusivePlayerPairs(players: PlayerProfile[]): PlayerProfile[] {
  const next = players.map((row) => ({ ...row, ally: [...row.ally], avoid: [...row.avoid] }))
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i].id
      const b = next[j].id
      if (!a || !b) continue
      const avoided = next[i].avoid.includes(b) || next[j].avoid.includes(a)
      const allied = next[i].ally.includes(b) || next[j].ally.includes(a)
      if (avoided && allied) {
        next[i].ally = next[i].ally.filter((item) => item !== b)
        next[j].ally = next[j].ally.filter((item) => item !== a)
      } else if (allied) {
        if (!next[i].ally.includes(b)) next[i].ally.push(b)
        if (!next[j].ally.includes(a)) next[j].ally.push(a)
      } else if (avoided) {
        if (!next[i].avoid.includes(b)) next[i].avoid.push(b)
        if (!next[j].avoid.includes(a)) next[j].avoid.push(a)
      }
    }
  }
  return next
}

export function parsePlayerLibrary(raw: unknown): PlayerProfile[] {
  if (!Array.isArray(raw)) return []
  const used = new Set<string>()
  const rows: PlayerProfile[] = []
  raw.forEach((item) => {
    const row = parsePlayerProfile(item)
    if (!row) return
    let id = row.id
    if (!id || used.has(id)) id = row.id ? `${row.id}-${newPlayerId()}` : `legacy:${row.name}:${row.created || row.seen || rows.length}`
    if (used.has(id)) id = newPlayerId()
    used.add(id)
    rows.push({ ...row, id })
  })
  const byId = new Set(rows.map((row) => row.id))
  const byName = new Map<string, string>()
  rows.forEach((row) => {
    if (!byName.has(row.name)) byName.set(row.name, row.id)
  })
  const remap = (refs: string[], self: string) => uniqueNames(refs.map((item) => {
    if (item === self) return ""
    if (byId.has(item)) return item
    return byName.get(item) || ""
  }), self)
  return exclusivePlayerPairs(rows.map((row) => ({
    ...row,
    ally: remap(row.ally, row.id),
    avoid: remap(row.avoid, row.id),
  })))
}

export function extractPlayersFromRoster(roster: RosterEntry[]): PlayerProfile[] {
  const names = roster.map((entry, index) => seatedName(entry, index))
  const out: PlayerProfile[] = []
  roster.forEach((entry, index) => {
    const name = names[index]
    if (!name) return
    const now = Date.now()
    const id = entry.playerId || newPlayerId()
    const ally = uniqueNames(entry.ally.map((item) => seatedPlayerId(roster[item] || emptySeat())))
    const avoid = uniqueNames(entry.avoid.map((item) => seatedPlayerId(roster[item] || emptySeat())))
    out.push({
      id,
      name,
      roles: entry.roles,
      heroes: entry.heroes,
      heroNone: entry.heroNone,
      ally,
      avoid,
      seen: now,
      created: now,
    })
  })
  return out
}

export function mergePlayers(library: PlayerProfile[], roster: RosterEntry[], admit = false): PlayerProfile[] {
  const seatedIds = new Set(roster.map((entry) => seatedPlayerId(entry)).filter(Boolean))
  const map = new Map<string, PlayerProfile>()
  library.forEach((row) => {
    if (row.id) map.set(row.id, row)
  })
  roster.forEach((entry, index) => {
    const id = seatedPlayerId(entry)
    const name = seatedName(entry, index)
    if (!id || !name) return
    const ally = uniqueNames(entry.ally.map((item) => seatedPlayerId(roster[item] || emptySeat())))
    const avoid = uniqueNames(entry.avoid.map((item) => seatedPlayerId(roster[item] || emptySeat())))
    const prev = map.get(id)
    if (!prev) {
      if (admit) map.set(id, { id, name, roles: entry.roles, heroes: entry.heroes, heroNone: entry.heroNone, ally, avoid, seen: Date.now(), created: Date.now() })
      return
    }
    map.set(id, {
      ...prev,
      name,
      roles: entry.roles,
      heroes: entry.heroes,
      heroNone: entry.heroNone,
      ally: uniqueNames([...prev.ally.filter((item) => !seatedIds.has(item)), ...ally], id),
      avoid: uniqueNames([...prev.avoid.filter((item) => !seatedIds.has(item)), ...avoid], id),
      seen: Date.now(),
    })
  })
  return exclusivePlayerPairs([...map.values()])
}

export function applyPlayerPairs(roster: RosterEntry[], players: PlayerProfile[]): RosterEntry[] {
  const byId = new Map(players.map((row) => [row.id, row]))
  const ids = roster.map((entry) => seatedPlayerId(entry))
  const next = roster.map((entry, index) => {
    const id = ids[index]
    if (!id) return entry
    const profile = byId.get(id)
    if (!profile) return { ...entry, playerId: "" }
    const ally: number[] = entry.ally.filter((item) => !ids[item])
    const avoid: number[] = entry.avoid.filter((item) => !ids[item])
    ids.forEach((other, otherIndex) => {
      if (otherIndex === index || !other) return
      const peer = byId.get(other)
      const avoided = profile.avoid.includes(other) || (peer ? peer.avoid.includes(id) : false)
      const allied = profile.ally.includes(other) || (peer ? peer.ally.includes(id) : false)
      if (avoided) avoid.push(otherIndex)
      else if (allied) ally.push(otherIndex)
    })
    return { ...entry, ally: [...new Set(ally)], avoid: [...new Set(avoid)] }
  })
  return exclusiveRoster(next)
}

export function setNamedPair(players: PlayerProfile[], left: string, right: string, key: "ally" | "avoid", on: boolean): PlayerProfile[] {
  if (!left || !right || left === right) return players
  const flip = key === "ally" ? "avoid" : "ally"
  const map = new Map(players.map((row) => [row.id, { ...row, ally: [...row.ally], avoid: [...row.avoid] }]))
  if (!map.has(left) && !map.has(right)) return players
  const leftRow = map.get(left)
  const rightRow = map.get(right)
  const current = Boolean(leftRow && (leftRow[key].includes(right) || (rightRow && rightRow[key].includes(left))))
  if (current === on) return exclusivePlayerPairs([...map.values()])
  ;[left, right].forEach((id) => {
    const other = id === left ? right : left
    const row = map.get(id)
    if (!row) return
    if (on) {
      if (!row[key].includes(other)) row[key].push(other)
      row[flip] = row[flip].filter((item) => item !== other)
    } else {
      row[key] = row[key].filter((item) => item !== other)
    }
  })
  return exclusivePlayerPairs([...map.values()])
}

export function renamePlayer(players: PlayerProfile[], id: string, to: string): PlayerProfile[] {
  const nextName = to.trim().slice(0, 16)
  if (!id || !nextName) return players
  return players.map((row) => (row.id === id ? { ...row, name: nextName, seen: Date.now() } : row))
}

export function deletePlayer(players: PlayerProfile[], id: string): PlayerProfile[] {
  return players.filter((row) => row.id !== id).map((row) => ({
    ...row,
    ally: row.ally.filter((item) => item !== id),
    avoid: row.avoid.filter((item) => item !== id),
  }))
}

export function fillSeatFromProfile(roster: RosterEntry[], index: number, profile: PlayerProfile): RosterEntry[] {
  return roster.map((entry, seat) => {
    if (seat !== index) return entry
    return {
      name: profile.name,
      open: true,
      roles: profile.roles.length ? profile.roles : [...ALL_ROLES],
      heroes: [...profile.heroes],
      heroNone: profile.heroNone,
      ally: [],
      avoid: [],
      playerId: profile.id,
    }
  })
}

export function findPlayer(players: PlayerProfile[], id: string) {
  return players.find((row) => row.id === id)
}

export function sortPlayers(players: PlayerProfile[]) {
  return players.slice().sort((a, b) => b.seen - a.seen || b.created - a.created || a.name.localeCompare(b.name, "zh"))
}

export function remapRoster(roster: RosterEntry[], from: Format, to: Format): RosterEntry[] {
  const prev = padRoster(roster)
  const shift = (ids: number[]) => [...new Set(ids.map((item) => remapPrefIndex(item, from, to)).filter((item): item is number => item != null))]
  const shifted = prev.map((entry) => ({
    ...entry,
    ally: shift(entry.ally),
    avoid: shift(entry.avoid),
  }))
  if (from === 5 && to === 6) {
    return padRoster([...shifted.slice(0, 5), shifted[10], ...shifted.slice(5, 10), shifted[11]])
  }
  if (from === 6 && to === 5) {
    return padRoster([...shifted.slice(0, 5), ...shifted.slice(6, 11), shifted[5], shifted[11]])
  }
  return padRoster(shifted)
}

export function remapPrefIndex(index: number | null, from: Format, to: Format): number | null {
  if (index == null) return null
  if (from === 5 && to === 6) {
    if (index < 5) return index
    if (index === 10) return 5
    if (index === 11) return 11
    if (index <= 9) return index + 1
    return index
  }
  if (from === 6 && to === 5) {
    if (index < 5) return index
    if (index === 5) return 10
    if (index === 11) return 11
    if (index <= 10) return index - 1
    return index
  }
  return index
}

export function allowedRoles(entry: RosterEntry): Role[] {
  return entry.roles.length ? entry.roles : ALL_ROLES
}

export function allowedHeroNames(entry: RosterEntry): Set<string> | null {
  if (entry.heroNone) return new Set()
  return entry.heroes.length ? new Set(entry.heroes) : null
}

export function entryCanTakeRole(entry: RosterEntry, role: Role, heroes: Hero[], ignoreHeroes = false): boolean {
  if (!allowedRoles(entry).includes(role)) return false
  if (ignoreHeroes) return true
  const allow = allowedHeroNames(entry)
  return heroPool(heroes).some((hero) => hero.role === role && (!allow || allow.has(hero.name)))
}

function canFillRole(entry: RosterEntry, role: Role, heroes: Hero[], rules: Rules): boolean {
  if (rules.teamsOnly) return true
  if (rules.allowPrefRoles && !allowedRoles(entry).includes(role)) return false
  if (rules.rolesOnly || !rules.allowPrefHeroes) return true
  const allow = allowedHeroNames(entry)
  return heroPool(heroes).some((hero) => hero.role === role && (!allow || allow.has(hero.name)))
}

export function roleSlots(format: Format): Role[] {
  return format === 6
    ? ["坦克", "坦克", "输出", "输出", "支援", "支援"]
    : ["坦克", "输出", "输出", "支援", "支援"]
}

export function roleNeed(format: Format): Record<Role, number> {
  const need: Record<Role, number> = { 坦克: 0, 输出: 0, 支援: 0 }
  for (const role of roleSlots(format)) need[role] += 1
  return need
}


export const defaultRules = (): Rules => ({
  balanceRoles: true,
  allowRepeat: false,
  allowReroll: false,
  balanceRatings: true,
  cycleHeroes: true,
  cycleMaps: true,
  cycleRoles: true,
  rolesOnly: false,
  teamsOnly: false,
  allowPrefRoles: true,
  allowPrefHeroes: true,
  allowPrefAlly: true,
  allowPrefAvoid: true,
})

export function normalizeRules(saved?: Partial<Rules> & { cycleSession?: boolean }): Rules {
  const { cycleSession, ...rest } = (saved || {}) as Partial<Rules> & { cycleSession?: boolean }
  const next = { ...defaultRules(), ...rest }
  if (typeof cycleSession === "boolean") {
    if (!Object.prototype.hasOwnProperty.call(rest, "cycleHeroes")) next.cycleHeroes = cycleSession
    if (!Object.prototype.hasOwnProperty.call(rest, "cycleMaps")) next.cycleMaps = cycleSession
  }
  return next
}

export type SavedState = {
  v: 1
  format: Format
  roster: RosterEntry[]
  players?: PlayerProfile[]
  rules: Rules
  poolVersion: string
  heroes: Record<string, { enabled: boolean; rating: Tier }>
  maps: Record<string, boolean>
  collapsed: boolean
  collapsedMaps?: boolean
  collapsedRules?: boolean
}

export function shuffle<T>(items: T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function ratingOf(heroes: Hero[], name: string): Tier {
  return heroes.find((hero) => hero.name === name)?.rating ?? "B"
}

export function scoreOf(heroes: Hero[], name: string): number {
  return TIER_SCORE[ratingOf(heroes, name)] ?? 8
}

export function teamScore(heroes: Hero[], team: Team): number {
  return team.reduce((sum, player) => sum + scoreOf(heroes, player.hero), 0)
}

export function scoreDiff(heroes: Hero[], teams: [Team, Team]): number {
  return Math.abs(teamScore(heroes, teams[0]) - teamScore(heroes, teams[1]))
}

function ratingTarget() {
  return Math.random() < 0.5 ? 0 : 1
}

function ratingCost(diff: number, target: number) {
  return (diff > 1 ? (diff - 1) * 50 : 0) + Math.abs(diff - target)
}

function heroPool(heroes: Hero[]) {
  return heroes.filter((hero) => hero.enabled)
}

function mapPool(maps: GameMap[]) {
  return maps.filter((map) => map.enabled)
}

function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())
}

export function poolError(heroes: Hero[], maps: GameMap[], rules: Rules, format: Format): string | null {
  if (!mapPool(maps).length) return "请至少选择一张地图"
  if (rules.rolesOnly || rules.teamsOnly) return null
  const pool = heroPool(heroes)
  const count = (role: Role) => pool.filter((hero) => hero.role === role).length
  const need = roleNeed(format)
  const copies = rules.allowRepeat ? 1 : 2
  if (!pool.length) return "请至少选择一名英雄"
  if (rules.balanceRoles && (count("坦克") < need.坦克 * copies || count("输出") < need.输出 * copies || count("支援") < need.支援 * copies)) {
    const hint = rules.allowRepeat ? "队伍位置平衡时" : "队伍位置平衡且英雄不重复时"
    return `${hint}，请至少选择 ${need.坦克 * copies} 位坦克、${need.输出 * copies} 位输出、${need.支援 * copies} 位支援。`
  }
  if (pool.length < format) return `请至少选择 ${format} 位英雄`
  return null
}

function leastSeen(candidates: Hero[], count: Record<string, number>): Hero[] {
  let min = Infinity
  candidates.forEach((hero) => {
    const n = count[hero.name] || 0
    if (n < min) min = n
  })
  return candidates.filter((hero) => (count[hero.name] || 0) === min)
}

function pickHero(
  heroes: Hero[],
  opts: {
    role: Role | null
    usedInTeam: Set<string>
    allowRepeat: boolean
    usedAcross: Set<string>
    exclude: string | null
    allow: Set<string> | null
    seen?: Record<string, number>
  },
): Hero {
  const pool = heroPool(heroes)
  const blocked = new Set(opts.usedInTeam)
  if (!opts.allowRepeat) opts.usedAcross.forEach((name) => blocked.add(name))
  if (opts.exclude) blocked.add(opts.exclude)
  let candidates = pool.filter((hero) => {
    if (blocked.has(hero.name)) return false
    if (opts.role && hero.role !== opts.role) return false
    if (opts.allow && !opts.allow.has(hero.name)) return false
    return true
  })
  if (!candidates.length) throw new Error("玩家偏好设置冲突")
  if (opts.seen) candidates = leastSeen(candidates, opts.seen)
  return randomItem(candidates)
}

function takeMap(maps: GameMap[], bag: string[]): { map: GameMap; bag: string[] } {
  const pool = mapPool(maps)
  const names = pool.map((map) => map.name)
  const have = new Set(bag.filter((name) => names.indexOf(name) >= 0))
  const next = bag.filter((name) => have.has(name))
  shuffle(names).forEach((name) => {
    if (!have.has(name)) next.push(name)
  })
  const name = next[0]
  const map = pool.find((item) => item.name === name) || pool[0]
  return { map, bag: next.slice(1) }
}

function bumpHeroes(teams: [Team, Team], count: Record<string, number>) {
  teams.forEach((team) => {
    team.forEach((player) => {
      if (!player.hero) return
      count[player.hero] = (count[player.hero] || 0) + 1
    })
  })
}

function bumpRoles(teams: [Team, Team], roster: RosterEntry[], format: Format, count: Record<string, Partial<Record<Role, number>>>) {
  const seats = roster.slice(0, format * 2)
  teams.forEach((team) => {
    team.forEach((player) => {
      if (!player.role) return
      let key = player.name
      seats.forEach((row, index) => {
        if (resolveSeatName(row, index) === player.name) key = personKey(row, index)
      })
      const row = count[key] || {}
      row[player.role] = (row[player.role] || 0) + 1
      count[key] = row
    })
  })
}

function assignSeats(roster: RosterEntry[], format: Format, heroes: Hero[], rules: Rules, session?: SessionDraw): { team: 0 | 1; role: Role; entry: RosterEntry; index: number }[] | null {
  const people = shuffle(roster.map((entry, index) => ({ entry, index })))
  const slots: { team: 0 | 1; role: Role | null }[] = []
  if (rules.balanceRoles && !rules.teamsOnly) {
    for (const role of roleSlots(format)) slots.push({ team: 0, role })
    for (const role of roleSlots(format)) slots.push({ team: 1, role })
  } else {
    for (let i = 0; i < format; i += 1) slots.push({ team: 0, role: null })
    for (let i = 0; i < format; i += 1) slots.push({ team: 1, role: null })
  }
  const used = slots.map(() => false)
  const pick = people.map(() => -1)
  const order = people.map((_, index) => index).sort((a, b) => {
    const left = rules.allowPrefRoles ? allowedRoles(people[a].entry).length : ALL_ROLES.length
    const right = rules.allowPrefRoles ? allowedRoles(people[b].entry).length : ALL_ROLES.length
    return left - right
  })
  const walk = (depth: number): boolean => {
    if (depth === order.length) return true
    const person = order[depth]
    const { entry, index: seat } = people[person]
    const candidates = shuffle(slots.map((_, slot) => slot).filter((slot) => {
      if (used[slot]) return false
      const need = slots[slot].role
      if (need) {
        if (!canFillRole(entry, need, heroes, rules)) return false
      } else if (!ALL_ROLES.some((role) => canFillRole(entry, role, heroes, rules))) {
        return false
      }
      if (rules.allowPrefAvoid || rules.allowPrefAlly) {
        const team = slots[slot].team
        for (let other = 0; other < people.length; other += 1) {
          if (pick[other] < 0) continue
          if (slots[pick[other]].team !== team) {
            if (rules.allowPrefAlly && (entry.ally.includes(people[other].index) || people[other].entry.ally.includes(seat))) return false
            continue
          }
          if (rules.allowPrefAvoid && (entry.avoid.includes(people[other].index) || people[other].entry.avoid.includes(seat))) return false
        }
      }
      return true
    }))
    if (rules.cycleRoles && session) {
      const counts = session.roleCount[personKey(entry, seat)] || {}
      candidates.sort((a, b) => {
        const left = slots[a].role
        const right = slots[b].role
        return (left ? counts[left] || 0 : 0) - (right ? counts[right] || 0 : 0)
      })
    }
    for (const slot of candidates) {
      used[slot] = true
      pick[person] = slot
      if (walk(depth + 1)) return true
      used[slot] = false
      pick[person] = -1
    }
    return false
  }
  if (!walk(0)) return null
  return people.map((person, index) => {
    const need = slots[pick[index]].role
    const fallback = ALL_ROLES.filter((role) => canFillRole(person.entry, role, heroes, rules))
    return {
      team: slots[pick[index]].team,
      role: need ?? (rules.cycleRoles && session
        ? leastSeenRole(fallback.length ? fallback : ALL_ROLES, session.roleCount[personKey(person.entry, person.index)])
        : randomItem(fallback.length ? fallback : ALL_ROLES)),
      entry: person.entry,
      index: person.index,
    }
  })
}

function fillHeroes(
  heroes: Hero[],
  seats: { team: 0 | 1; role: Role; entry: RosterEntry; index: number }[],
  rules: Rules,
  format: Format,
  seen?: Record<string, number>,
): [Team, Team] {
  const size = format
  const teams: [Team, Team] = [
    Array.from({ length: size }, () => ({ name: "", hero: "", role: "输出" as Role })),
    Array.from({ length: size }, () => ({ name: "", hero: "", role: "输出" as Role })),
  ]
  const at = [0, 0]
  const usedAcross = new Set<string>()
  const usedInTeam: [Set<string>, Set<string>] = [new Set(), new Set()]
  shuffle(seats).forEach((seat) => {
    const pick = pickHero(heroes, {
      role: seat.role,
      usedInTeam: usedInTeam[seat.team],
      allowRepeat: rules.allowRepeat,
      usedAcross,
      exclude: null,
      allow: rules.allowPrefHeroes ? allowedHeroNames(seat.entry) : null,
      seen: rules.cycleHeroes ? seen : undefined,
    })
    const index = at[seat.team]
    at[seat.team] += 1
    teams[seat.team][index] = { name: seat.entry.name.trim(), hero: pick.name, role: pick.role }
    usedInTeam[seat.team].add(pick.name)
    usedAcross.add(pick.name)
  })
  return teams
}

function fillRoles(
  seats: { team: 0 | 1; role: Role; entry: RosterEntry; index: number }[],
  format: Format,
): [Team, Team] {
  const size = format
  const teams: [Team, Team] = [
    Array.from({ length: size }, () => ({ name: "", hero: "", role: "输出" as Role })),
    Array.from({ length: size }, () => ({ name: "", hero: "", role: "输出" as Role })),
  ]
  const at = [0, 0]
  shuffle(seats).forEach((seat) => {
    const index = at[seat.team]
    at[seat.team] += 1
    teams[seat.team][index] = { name: seat.entry.name.trim(), hero: "", role: seat.role }
  })
  return teams
}

function fillTeams(
  seats: { team: 0 | 1; entry: RosterEntry }[],
  format: Format,
): [Team, Team] {
  const size = format
  const teams: [Team, Team] = [
    Array.from({ length: size }, () => ({ name: "", hero: "", role: "输出" as Role })),
    Array.from({ length: size }, () => ({ name: "", hero: "", role: "输出" as Role })),
  ]
  const at = [0, 0]
  shuffle(seats).forEach((seat) => {
    const index = at[seat.team]
    at[seat.team] += 1
    teams[seat.team][index] = { name: seat.entry.name.trim(), hero: "", role: "输出" }
  })
  return teams
}


const ROLE_ROW = { 坦克: 0, 输出: 1, 支援: 2 } as const

function orderTeams(teams: [Team, Team]): [Team, Team] {
  return teams.map((team) => team.slice().sort((a, b) => ROLE_ROW[a.role] - ROLE_ROW[b.role])) as [Team, Team]
}

function pairError(roster: RosterEntry[], format: Format, rules: Rules): string | null {
  const need = format * 2
  const seats = roster.slice(0, need)
  const allyOn = rules.allowPrefAlly
  const avoidOn = rules.allowPrefAvoid
  if (!allyOn && !avoidOn) return null

  const linked = (i: number, j: number, key: "ally" | "avoid") => seats[i][key].includes(j) || seats[j][key].includes(i)

  const parent = Array.from({ length: need }, (_, index) => index)
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])))
  const unite = (a: number, b: number) => {
    const left = find(a)
    const right = find(b)
    if (left !== right) parent[left] = right
  }
  if (allyOn) {
    for (let i = 0; i < need; i += 1) {
      for (const other of seats[i].ally) {
        if (other !== i && other < need) unite(i, other)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < need; i += 1) {
    const root = find(i)
    const members = groups.get(root)
    if (members) members.push(i)
    else groups.set(root, [i])
  }

  if (allyOn) {
    for (const members of groups.values()) {
      if (members.length > format) return "亲和人数超过一队，无法组队"
    }
  }

  if (allyOn && avoidOn) {
    for (const members of groups.values()) {
      for (let a = 0; a < members.length; a += 1) {
        for (let b = a + 1; b < members.length; b += 1) {
          if (linked(members[a], members[b], "avoid")) return "亲和与排斥冲突，无法组队"
        }
      }
    }
  }

  if (!avoidOn) return null

  const ids = [...groups.keys()]
  const at = new Map(ids.map((id, index) => [id, index]))
  const size = ids.map((id) => {
    const members = groups.get(id)
    return members ? members.length : 0
  })
  const adj: number[][] = ids.map(() => [])
  for (let i = 0; i < need; i += 1) {
    for (const other of seats[i].avoid) {
      if (other === i || other >= need) continue
      const a = at.get(find(i))
      const b = at.get(find(other))
      if (a == null || b == null || a === b) continue
      if (adj[a].indexOf(b) < 0) {
        adj[a].push(b)
        adj[b].push(a)
      }
    }
  }

  const color = ids.map(() => -1)
  const blobs: { a: number; b: number }[] = []
  for (let start = 0; start < ids.length; start += 1) {
    if (color[start] !== -1) continue
    color[start] = 0
    const queue = [start]
    let sideA = 0
    let sideB = 0
    for (const node of queue) {
      if (color[node] === 0) sideA += size[node]
      else sideB += size[node]
      for (const next of adj[node]) {
        if (color[next] === -1) {
          color[next] = 1 - color[node]
          queue.push(next)
        } else if (color[next] === color[node]) {
          return "排斥关系无法分成两队"
        }
      }
    }
    if (sideA > format || sideB > format) return "排斥人数过多，无法组队"
    blobs.push({ a: sideA, b: sideB })
  }

  let possible = new Set([0])
  for (const blob of blobs) {
    const next = new Set<number>()
    for (const sum of possible) {
      next.add(sum + blob.a)
      next.add(sum + blob.b)
    }
    possible = next
  }
  if (!possible.has(format)) return "排斥关系无法分成两队"
  return null
}

function dealTeams(heroes: Hero[], roster: RosterEntry[], rules: Rules, format: Format, session?: SessionDraw): [Team, Team] {
  const cleaned = exclusiveRoster(roster)
  const conflict = pairError(cleaned, format, rules)
  if (conflict) throw new Error(conflict)
  const rate = !rules.rolesOnly && !rules.teamsOnly && rules.balanceRatings
  const cycleRole = Boolean(rules.cycleRoles && !rules.teamsOnly && session)
  const search = rate || cycleRole
  const target = rate ? ratingTarget() : 0
  let best: [Team, Team] | null = null
  let bestCost = Infinity
  for (let i = 0; i < RATE_TRIES; i += 1) {
    const seats = assignSeats(cleaned, format, heroes, rules, session)
    if (!seats) continue
    const teams = rules.teamsOnly
      ? fillTeams(seats, format)
      : rules.rolesOnly
        ? fillRoles(seats, format)
        : fillHeroes(heroes, seats, rules, format, rules.cycleHeroes ? session?.heroCount : undefined)
    const cost = (rate ? ratingCost(scoreDiff(heroes, teams), target) * 100 : 0) + (cycleRole ? roleCycleCost(seats, session) : 0)
    if (cost < bestCost) {
      best = teams
      bestCost = cost
    }
    if (!search) return orderTeams(teams)
    if (bestCost === 0) break
  }
  if (!best) throw new Error("玩家偏好设置冲突")
  return orderTeams(best)
}

export function randomizeMatch(
  heroes: Hero[],
  maps: GameMap[],
  roster: RosterEntry[],
  rules: Rules,
  format: Format,
  session?: SessionDraw,
): Match {
  const err = poolError(heroes, maps, rules, format)
  if (err) throw new Error(err)
  const need = format * 2
  const seats = roster.slice(0, need)
  if (seats.some((entry) => !entry.open && !entry.name.trim())) {
    throw new Error("请填充玩家名单")
  }
  const trimmed = seats.map((entry, index) => ({ ...entry, name: resolveSeatName(entry, index) }))
  const teams = dealTeams(heroes, trimmed, rules, format, session)
  const picked = rules.cycleMaps && session
    ? takeMap(maps, session.mapBag)
    : { map: randomItem(mapPool(maps)), bag: session?.mapBag || [] }
  if (session) session.mapBag = picked.bag
  const map = picked.map
  if (rules.cycleHeroes && session && !rules.rolesOnly && !rules.teamsOnly) bumpHeroes(teams, session.heroCount)
  if (rules.cycleRoles && session && !rules.teamsOnly) bumpRoles(teams, trimmed, format, session.roleCount)
  return {
    format,
    map,
    teams,
    audit: [],
    rolesOnly: rules.rolesOnly,
    teamsOnly: rules.teamsOnly,
  }
}

export function rerollSeat(heroes: Hero[], match: Match, rules: Rules, teamIndex: 0 | 1, playerIndex: number, roster: RosterEntry[], session?: SessionDraw): Match {
  if (match.teamsOnly) return match
  const size = match.format
  const teams: [Team, Team] = [
    match.teams[0].map((player) => ({ ...player })),
    match.teams[1].map((player) => ({ ...player })),
  ]
  const target = teams[teamIndex][playerIndex]
  const entry = roster.slice(0, size * 2).find((row, index) => resolveSeatName(row, index) === target.name)
  if (match.rolesOnly) {
    if (rules.balanceRoles) return match
    const roles = rules.allowPrefRoles ? allowedRoles(entry ?? emptySeat()) : ALL_ROLES
    const options = roles.filter((role) => role !== target.role)
    const pool = options.length ? options : roles
    const seat = roster.slice(0, size * 2).findIndex((row, index) => resolveSeatName(row, index) === target.name)
    const key = entry && seat >= 0 ? personKey(entry, seat) : target.name
    const next = rules.cycleRoles && session ? leastSeenRole(pool, session.roleCount[key]) : randomItem(pool)
    if (next === target.role) return match
    const from = target.role
    target.role = next
    if (rules.cycleRoles && session) {
      const row = session.roleCount[key] || {}
      row[next] = (row[next] || 0) + 1
      session.roleCount[key] = row
    }
    return {
      ...match,
      teams: orderTeams(teams),
      audit: [...match.audit, { time: nowTime(), text: `${target.name}（${teamIndex === 0 ? "蓝队" : "红队"}）更换职责`, from, to: next }],
    }
  }
  const oldHero = target.hero
  const usedInTeam = new Set(teams[teamIndex].filter((_, i) => i !== playerIndex).map((p) => p.hero))
  const usedAcross = new Set(teams.flat().filter((_, i) => i !== teamIndex * size + playerIndex).map((p) => p.hero))
  const pool = heroPool(heroes)
  const blocked = new Set(usedInTeam)
  if (!rules.allowRepeat) usedAcross.forEach((name) => blocked.add(name))
  blocked.add(oldHero)
  const allow = rules.allowPrefHeroes && entry ? allowedHeroNames(entry) : null
  let candidates = pool.filter((hero) => hero.role === target.role && !blocked.has(hero.name) && (!allow || allow.has(hero.name)))
  if (!candidates.length) return match
  if (rules.cycleHeroes && session) candidates = leastSeen(candidates, session.heroCount)
  let pick = randomItem(candidates)
  if (rules.balanceRatings) {
    const targetDiff = ratingTarget()
    let bestCost = Infinity
    const bests: Hero[] = []
    candidates.forEach((hero) => {
      target.hero = hero.name
      target.role = hero.role
      const cost = ratingCost(scoreDiff(heroes, teams), targetDiff)
      if (cost < bestCost) {
        bestCost = cost
        bests.length = 0
        bests.push(hero)
      } else if (cost === bestCost) bests.push(hero)
    })
    pick = randomItem(bests)
  }
  target.hero = pick.name
  target.role = pick.role
  if (rules.cycleHeroes && session && pick.name) session.heroCount[pick.name] = (session.heroCount[pick.name] || 0) + 1
  return {
    ...match,
    teams,
    audit: [
      ...match.audit,
      {
        time: nowTime(),
        text: `${target.name}（${teamIndex === 0 ? "蓝队" : "红队"}）更换英雄`,
        from: oldHero,
        to: pick.name,
      },
    ],
  }
}

export function loadSaved(): SavedState | null {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || "null") as (SavedState & { names?: string[] }) | null
    if (!data || data.v !== 1) return null
    const format: Format = data.format === 6 ? 6 : 5
    const roster = padRoster(
      Array.isArray(data.roster) && data.roster.length
        ? data.roster.map(parseRosterEntry)
        : Array.isArray(data.names)
          ? data.names.map((name) => parseRosterEntry(name))
          : [],
    )
    const players = mergePlayers(parsePlayerLibrary(data.players), roster, data.players == null)
    return {
      v: 1,
      format,
      roster: applyPlayerPairs(roster, players),
      players,
      rules: normalizeRules(data.rules),
      poolVersion: typeof data.poolVersion === "string" ? data.poolVersion : "",
      heroes: data.heroes || {},
      maps: data.maps || {},
      collapsed: Boolean(data.collapsed),
      collapsedMaps: typeof data.collapsedMaps === "boolean" ? data.collapsedMaps : undefined,
      collapsedRules: typeof data.collapsedRules === "boolean" ? data.collapsedRules : undefined,
    }
  } catch {
    return null
  }
}

export function saveState(state: SavedState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    /* private mode */
  }
}

export function hydrateCatalogs(saved: SavedState | null) {
  const heroes = createHeroes()
  const maps = createMaps()
  if (saved?.poolVersion === POOL_VERSION) {
    if (saved.heroes) {
      heroes.forEach((hero) => {
        const row = saved.heroes[hero.name]
        if (!row) return
        if (typeof row.enabled === "boolean") hero.enabled = row.enabled
        if (row.rating && TIER_SCORE[row.rating] != null) hero.rating = row.rating
      })
    }
    if (saved.maps) {
      maps.forEach((map) => {
        if (typeof saved.maps[map.name] === "boolean") map.enabled = saved.maps[map.name]
      })
    }
  }
  return { heroes, maps }
}



export function matchChatText(heroes: Hero[], match: Match) {
  const lines = [
    `地图：${match.map.name}（${match.map.mode}）`,
    "",
  ]
  match.teams.forEach((team, index) => {
    const hideScore = match.rolesOnly || match.teamsOnly
    lines.push(hideScore ? (index === 0 ? "蓝队" : "红队") : `${index === 0 ? "蓝队" : "红队"}  ${teamScore(heroes, team)}分`)
    team.forEach((player, i) => {
      const no = String(i + 1).padStart(2, "0")
      if (match.teamsOnly) lines.push(`${no}  ${player.name}`)
      else if (match.rolesOnly) lines.push(`${no}  ${player.name}  ${player.role}`)
      else lines.push(`${no}  ${player.name}  ${player.hero}  ${player.role}`)
    })
    lines.push("")
  })
  return lines.join("\n").trim()
}

export function heroByName(heroes: Hero[], name: string) {
  return heroes.find((hero) => hero.name === name)
}

export { portraitUrl, TIER_RANK, MODE_ORDER, POOL_VERSION }
export type { Hero, GameMap, Role, Tier }
