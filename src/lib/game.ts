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

export type RosterEntry = {
  name: string
  roles: Role[]
  open: boolean
  ally: number[]
  avoid: number[]
  heroes: string[]
  heroNone: boolean
}

export const ROSTER_CAP = 12

export function emptySeat(): RosterEntry {
  return { name: "", roles: [...ALL_ROLES], open: false, ally: [], avoid: [], heroes: [], heroNone: false }
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
    return { name, roles: [...ALL_ROLES], open: Boolean(name.trim()), ally: [], avoid: [], heroes: [], heroNone: false }
  }
  if (!raw || typeof raw !== "object") return emptySeat()
  const row = raw as { name?: unknown; roles?: unknown; open?: unknown; ally?: unknown; avoid?: unknown; heroes?: unknown; heroNone?: unknown }
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
  return { name, roles, open, ally: ids(row.ally), avoid: ids(row.avoid), heroes, heroNone: row.heroNone === true }
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
  rolesOnly: false,
  teamsOnly: false,
  allowPrefRoles: true,
  allowPrefHeroes: true,
  allowPrefAlly: true,
  allowPrefAvoid: true,
})

export type SavedState = {
  v: 1
  format: Format
  roster: RosterEntry[]
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

function pickHero(
  heroes: Hero[],
  opts: {
    role: Role | null
    usedInTeam: Set<string>
    allowRepeat: boolean
    usedAcross: Set<string>
    exclude: string | null
    allow: Set<string> | null
  },
): Hero {
  const pool = heroPool(heroes)
  const blocked = new Set(opts.usedInTeam)
  if (!opts.allowRepeat) opts.usedAcross.forEach((name) => blocked.add(name))
  if (opts.exclude) blocked.add(opts.exclude)
  const candidates = pool.filter((hero) => {
    if (blocked.has(hero.name)) return false
    if (opts.role && hero.role !== opts.role) return false
    if (opts.allow && !opts.allow.has(hero.name)) return false
    return true
  })
  if (!candidates.length) throw new Error("玩家偏好设置冲突")
  return randomItem(candidates)
}

function assignSeats(roster: RosterEntry[], format: Format, heroes: Hero[], rules: Rules): { team: 0 | 1; role: Role; entry: RosterEntry; index: number }[] | null {
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
      role: need ?? randomItem(fallback.length ? fallback : ALL_ROLES),
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

function dealTeams(heroes: Hero[], roster: RosterEntry[], rules: Rules, format: Format): [Team, Team] {
  const cleaned = exclusiveRoster(roster)
  const conflict = pairError(cleaned, format, rules)
  if (conflict) throw new Error(conflict)
  const rate = !rules.rolesOnly && !rules.teamsOnly && rules.balanceRatings
  const target = rate ? ratingTarget() : 0
  let best: [Team, Team] | null = null
  let bestCost = Infinity
  for (let i = 0; i < RATE_TRIES; i += 1) {
    const seats = assignSeats(cleaned, format, heroes, rules)
    if (!seats) continue
    const teams = rules.teamsOnly
      ? fillTeams(seats, format)
      : rules.rolesOnly
        ? fillRoles(seats, format)
        : fillHeroes(heroes, seats, rules, format)
    const cost = rate ? ratingCost(scoreDiff(heroes, teams), target) : 0
    if (cost < bestCost) {
      best = teams
      bestCost = cost
    }
    if (!rate) return orderTeams(teams)
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
): Match {
  const err = poolError(heroes, maps, rules, format)
  if (err) throw new Error(err)
  const need = format * 2
  const seats = roster.slice(0, need)
  if (seats.some((entry) => !entry.open && !entry.name.trim())) {
    throw new Error("请填充玩家名单")
  }
  const trimmed = seats.map((entry, index) => ({ ...entry, name: resolveSeatName(entry, index) }))
  const teams = dealTeams(heroes, trimmed, rules, format)
  const map = randomItem(mapPool(maps))
  return {
    format,
    map,
    teams,
    audit: [],
    rolesOnly: rules.rolesOnly,
    teamsOnly: rules.teamsOnly,
  }
}

export function rerollSeat(heroes: Hero[], match: Match, rules: Rules, teamIndex: 0 | 1, playerIndex: number, roster: RosterEntry[]): Match {
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
    const next = randomItem(roles.filter((role) => role !== target.role).length ? roles.filter((role) => role !== target.role) : roles)
    if (next === target.role) return match
    const from = target.role
    target.role = next
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
  const candidates = pool.filter((hero) => hero.role === target.role && !blocked.has(hero.name) && (!allow || allow.has(hero.name)))
  if (!candidates.length) return match
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
    const roster = Array.isArray(data.roster) && data.roster.length
      ? data.roster.map(parseRosterEntry)
      : Array.isArray(data.names)
        ? data.names.map((name) => parseRosterEntry(name))
        : []
    return {
      v: 1,
      format,
      roster: padRoster(roster),
      rules: { ...defaultRules(), ...data.rules },
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
