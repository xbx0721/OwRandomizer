import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, ChevronUp, Copy, Crosshair, Heart, Image, Import, Loader2, MoreHorizontal, Pencil, RotateCcw, RotateCw, Search, Settings2, Share2, Shield, Shuffle, Star, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { HeroPortrait } from "./components/HeroPortrait"
import { cardImageFile, renderMatchCard } from "./lib/shareCard"
import { ModeGlyph } from "./lib/modeIcon"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card"
import { Checkbox } from "./components/ui/checkbox"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "./components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog"
import { Input } from "./components/ui/input"
import { Label } from "./components/ui/label"
import { ScrollArea } from "./components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { Switch } from "./components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group"
import {
  ALL_ROLES,
  MODE_ORDER,
  POOL_VERSION,
  TIER_RANK,
  applyPlayerPairs,
  normalizeRules,
  emptySession,
  deletePlayer,
  emptySeat,
  extractPlayersFromRoster,
  seatedPlayerId,
  newPlayerId,
  formatFavoriteDate,
  fillSeatFromProfile,
  findPlayer,
  heroByName,
  hydrateCatalogs,
  loadSaved,
  matchChatText,
  mergePlayers,
  padRoster,
  revealSeats,
  remapPrefIndex,
  remapRoster,
  randomizeMatch,
  renamePlayer,
  rerollSeat,
  resolveSeatName,
  saveState,
  seatedName,
  seatLabel,
  setNamedPair,
  sortPlayers,
  teamScore,
  type Format,
  type GameMap,
  type Hero,
  type Match,
  type PlayerProfile,
  type Role,
  type RosterEntry,
  type Rules,
  type Tier,
} from "./lib/game"

const RULE_GROUPS: { title: string; items: { key: keyof Rules; title: string }[] }[] = [
  {
    title: "对局",
    items: [
      { key: "teamsOnly", title: "仅分配队伍" },
      { key: "rolesOnly", title: "仅分配职责" },
      { key: "balanceRoles", title: "平衡队伍职责" },
      { key: "balanceRatings", title: "平衡英雄评级" },
      { key: "cycleHeroes", title: "优先剩余英雄" },
      { key: "cycleMaps", title: "优先剩余地图" },
      { key: "cycleRoles", title: "优先剩余职责" },
      { key: "allowRepeat", title: "允许重复英雄" },
      { key: "allowReroll", title: "允许重选英雄" },
    ],
  },
  {
    title: "偏好",
    items: [
      { key: "allowPrefRoles", title: "允许偏好职责" },
      { key: "allowPrefHeroes", title: "允许偏好英雄" },
      { key: "allowPrefAlly", title: "允许偏好亲和" },
      { key: "allowPrefAvoid", title: "允许偏好排斥" },
    ],
  },
]

function ruleDisabled(key: keyof Rules, rules: Rules) {
  if (rules.teamsOnly) {
    return key === "balanceRoles" || key === "balanceRatings" || key === "cycleHeroes" || key === "cycleRoles" || key === "allowRepeat" || key === "allowReroll" || key === "allowPrefRoles" || key === "allowPrefHeroes"
  }
  const heroRule = key === "allowRepeat" || key === "balanceRatings" || key === "cycleHeroes" || key === "allowPrefHeroes"
  return (heroRule && rules.rolesOnly) || (key === "allowReroll" && rules.rolesOnly && rules.balanceRoles)
}

function ruleTitle(key: keyof Rules, title: string, rules: Rules) {
  if (key === "allowReroll" && rules.rolesOnly) return "允许重选职责"
  return title
}

function usePrefBodyHeight(open: boolean, tick: string) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (!open) return
    const el = innerRef.current
    if (!el) return
    const apply = () => {
      const dialog = el.closest('[role="dialog"]') as HTMLElement | null
      const head = dialog?.querySelector("[data-pref-head]") as HTMLElement | null
      const foot = dialog?.querySelector("[data-pref-foot]") as HTMLElement | null
      const borders = dialog ? dialog.offsetHeight - dialog.clientHeight : 0
      const chrome = (head?.offsetHeight ?? 0) + (foot?.offsetHeight ?? 0) + borders
      const view = window.visualViewport?.height ?? window.innerHeight
      const cap = Math.max(0, view * 0.85 - chrome)
      const needed = el.scrollHeight
      setHeight(cap > 0 ? Math.min(needed, cap) : needed)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    window.addEventListener("resize", apply)
    window.visualViewport?.addEventListener("resize", apply)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", apply)
      window.visualViewport?.removeEventListener("resize", apply)
    }
  }, [open, tick])
  return { innerRef, height }
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return Promise.reject(new Error("clipboard unavailable"))
}

type CardAction = "share" | "copy"

function detectCardAction(): CardAction {
  if (typeof navigator === "undefined") return "copy"
  return /iPhone|iPad|iPod|Android|MicroMessenger|HarmonyOS/i.test(navigator.userAgent) ? "share" : "copy"
}

const HEAD_GAP = 4

function boxWidth(el: HTMLElement | null) {
  return el ? el.getBoundingClientRect().width : 0
}

function actionsWidth(el: HTMLElement | null) {
  if (!el) return 0
  const kids = [...el.children] as HTMLElement[]
  if (!kids.length) return 0
  return kids.reduce((sum, kid) => sum + kid.getBoundingClientRect().width, 0) + HEAD_GAP * Math.max(0, kids.length - 1)
}

type HeadMode = "all" | "pin-more" | "more"

const InHeadMenu = createContext(false)

function MoreBtn({ onClick }: { onClick?: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClick}>
      <MoreHorizontal className="h-4 w-4" />
      更多
    </Button>
  )
}

function CopyTextButton({ onClick }: { onClick: () => void }) {
  const inMenu = useContext(InHeadMenu)
  return (
    <Button variant="outline" size="sm" className="h-8" onClick={onClick}>
      <Copy className="h-4 w-4" />
      {inMenu ? "复制" : "复制结果"}
    </Button>
  )
}

function CopyCardButton({
  busy,
  share,
  disabled,
  onClick,
}: {
  busy: boolean
  share: boolean
  disabled: boolean
  onClick: () => void
}) {
  const inMenu = useContext(InHeadMenu)
  const idle = share ? "分享" : inMenu ? "卡片" : "复制卡片"
  return (
    <Button variant="outline" size="sm" className="h-8" disabled={disabled} onClick={onClick}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : share ? <Share2 className="h-4 w-4" /> : <Image className="h-4 w-4" />}
      {idle}
    </Button>
  )
}

function SectionHead({
  title,
  hint,
  pin,
  pinEnd,
  children,
}: {
  title: string
  hint: ReactNode
  pin?: ReactNode
  pinEnd?: boolean
  children?: ReactNode
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const titleFitRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const restRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<HeadMode>("all")
  const [menuOpen, setMenuOpen] = useState(false)

  useLayoutEffect(() => {
    const row = rowRef.current
    const titleBox = titleFitRef.current
    if (!row || !titleBox) return
    const check = () => {
      const t = titleBox.scrollWidth
      const p = boxWidth(pinRef.current)
      const r = actionsWidth(restRef.current)
      const m = boxWidth(moreRef.current)
      const w = row.clientWidth
      const all = p + (r ? HEAD_GAP + r : 0)
      const pinMore = (p ? p + HEAD_GAP : 0) + m
      if (t + HEAD_GAP + all <= w) setMode("all")
      else if (p && t + HEAD_GAP + pinMore <= w) setMode("pin-more")
      else setMode("more")
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(row)
    ro.observe(titleBox)
    if (pinRef.current) ro.observe(pinRef.current)
    if (restRef.current) ro.observe(restRef.current)
    if (moreRef.current) ro.observe(moreRef.current)
    return () => ro.disconnect()
  }, [pin, children, title, hint])

  useEffect(() => {
    setMenuOpen(false)
  }, [mode])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDoc)
    return () => document.removeEventListener("pointerdown", onDoc)
  }, [menuOpen])

  const hasRest = children != null && children !== false
  const menuItems = mode === "pin-more"
    ? children
    : pinEnd
      ? <>{children}{pin}</>
      : <>{pin}{children}</>

  return (
    <CardHeader className="relative">
      <div
        className="pointer-events-none absolute left-0 top-0 -z-10 flex h-0 overflow-hidden opacity-0"
        aria-hidden
      >
        <div ref={titleFitRef} className="w-max shrink-0 font-display text-lg font-semibold leading-none tracking-tight">{title}</div>
        {pin ? <div ref={pinRef} className="shrink-0">{pin}</div> : null}
        {hasRest ? <div ref={restRef} className="flex gap-1">{children}</div> : null}
        <div ref={moreRef} className="shrink-0"><MoreBtn /></div>
      </div>
      <div ref={rowRef} className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardTitle className="truncate">{title}</CardTitle>
          <CardDescription className="truncate leading-none">{hint}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {mode === "all" && !pinEnd ? pin : null}
          {mode === "all" && hasRest ? children : null}
          {mode === "all" && pinEnd ? pin : null}
          {mode === "pin-more" ? pin : null}
          {mode !== "all" ? (
            <div ref={menuRef} className="relative shrink-0">
              <MoreBtn onClick={() => setMenuOpen((open) => !open)} />
              {menuOpen ? (
                <div
                  className="absolute right-0 z-50 mt-1 flex w-max min-w-full flex-col gap-0.5 rounded-md border bg-popover p-0.5 shadow-md [&_button]:h-8 [&_button]:w-full [&_button]:justify-start [&_button]:px-2"
                  onClick={() => setMenuOpen(false)}
                >
                  <InHeadMenu.Provider value={true}>{menuItems}</InHeadMenu.Provider>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}

function roleDot(role: Role) {
  return role === "坦克" ? "bg-primary" : role === "输出" ? "bg-destructive" : "bg-support"
}

const ROLE_ICON = {
  坦克: Shield,
  输出: Crosshair,
  支援: Heart,
} as const

function QuestionMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  )
}

const FAVORITE_FILTER_MIN = 8

function ListFilter({
  value,
  onChange,
  autoFocus,
  onEnter,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  onEnter?: () => void
}) {
  return (
    <label className="flex items-center gap-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      <input
        value={value}
        autoFocus={autoFocus}
        placeholder="筛选"
        aria-label="筛选"
        className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault()
            onEnter()
          }
        }}
      />
    </label>
  )
}

function SeatRow({
  index,
  entry,
  recorded,
  onVacate,
  onDraftName,
  onBindName,
  onPref,
  onToggleRecord,
  onImport,
}: {
  index: number
  entry: RosterEntry
  recorded: boolean
  onVacate: () => void
  onDraftName: (name: string) => void
  onBindName: (name: string) => void
  onPref: () => void
  onToggleRecord: () => void
  onImport: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!menuOpen) return
    const hide = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", hide)
    return () => document.removeEventListener("mousedown", hide)
  }, [menuOpen])
  return (
    <div ref={boxRef} className={`group relative flex h-12 items-center gap-2 px-3 ${menuOpen ? "z-20" : ""}`}>
      <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
      <Input
        maxLength={16}
        value={entry.name}
        placeholder={seatLabel(index)}
        aria-label={seatLabel(index)}
        autoComplete="off"
        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        onChange={(event) => onDraftName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onBindName(event.currentTarget.value)
          }
        }}
        onBlur={(event) => onBindName(event.target.value)}
      />
      {recorded ? (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="取消收藏" onClick={onToggleRecord}>
          <Star className="h-4 w-4 fill-primary text-primary" />
        </Button>
      ) : null}
      <div className="relative shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="更多" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 z-50 mt-1 flex w-max min-w-36 flex-col gap-0.5 rounded-md border bg-popover p-0.5 shadow-md">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start px-2" onClick={() => { setMenuOpen(false); onToggleRecord() }}>
              <Star className={`h-4 w-4 ${recorded ? "fill-primary text-primary" : ""}`} />
              {recorded ? "取消收藏" : "加入收藏"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start px-2" onClick={() => { setMenuOpen(false); onImport() }}>
              <Import className="h-4 w-4" />
              导入收藏
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start px-2" onClick={() => { setMenuOpen(false); onPref() }}>
              <Settings2 className="h-4 w-4" />
              偏好设置
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start px-2 text-destructive hover:text-destructive" onClick={() => { setMenuOpen(false); onVacate() }}>
              <RotateCcw className="h-4 w-4" />
              玩家重置
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PrefTabs({
  prefTab,
  setPrefTab,
  prefIndex,
  roster,
  format,
  heroes,
  patchRoster,
  toggleHero,
  togglePair,
  prefSelectAll,
  prefClear,
  onDone,
}: {
  prefTab: string
  setPrefTab: (value: string) => void
  prefIndex: number
  roster: RosterEntry[]
  format: Format
  heroes: Hero[]
  patchRoster: (index: number, patch: Partial<RosterEntry>) => void
  toggleHero: (index: number, name: string) => void
  togglePair: (index: number, other: number, key: "ally" | "avoid") => void
  prefSelectAll: () => void
  prefClear: () => void
  onDone: () => void
}) {
  const { innerRef, height } = usePrefBodyHeight(true, `${prefTab}:${prefIndex}:${format}`)
  const entry = roster[prefIndex]
  return (
    <Tabs value={prefTab} onValueChange={setPrefTab} className="flex min-h-0 flex-col overflow-hidden">
      <DialogHeader className="border-b px-6 pb-4 pt-6" data-pref-head="">
        <DialogTitle>偏好设置</DialogTitle>
        <DialogDescription>{`设置玩家 ${resolveSeatName(entry, prefIndex)} 的偏好`}</DialogDescription>
        <TabsList className="mt-4 grid h-8 w-full grid-cols-4 p-0.5">
          <TabsTrigger className="h-7 px-1 sm:px-2" value="roles">职责</TabsTrigger>
          <TabsTrigger className="h-7 px-1 sm:px-2" value="heroes">英雄</TabsTrigger>
          <TabsTrigger className="h-7 px-1 sm:px-2" value="ally">亲和</TabsTrigger>
          <TabsTrigger className="h-7 px-1 sm:px-2" value="avoid">排斥</TabsTrigger>
        </TabsList>
      </DialogHeader>
      <div
        className="min-h-0 overflow-hidden motion-reduce:transition-none"
        style={{ height, transition: "height 220ms ease" }}
      >
        <ScrollArea className="h-full">
        <div ref={innerRef}>
          <TabsContent value="roles" className="mt-0 px-6 py-4">
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={entry.roles}
              onValueChange={(next) => patchRoster(prefIndex, { roles: next as Role[] })}
              className="grid w-full grid-cols-3 gap-2"
            >
              {ALL_ROLES.map((role) => {
                const Icon = ROLE_ICON[role]
                return (
                  <ToggleGroupItem key={role} value={role} className="h-16 flex-col gap-1 bg-background data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    <Icon className="h-4 w-4" />
                    {role}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          </TabsContent>
          <TabsContent value="heroes" className="mt-0 space-y-3 px-6 py-4">
            {ALL_ROLES.map((role) => {
              const list = heroes.filter((hero) => hero.role === role)
              const muted = entry.roles.length > 0 && entry.roles.indexOf(role) < 0
              return (
                <section key={role}>
                  <div className={`mb-2 text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}>{role}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {list.map((hero) => {
                      const id = `pref-hero-${prefIndex}-${hero.name}`
                      const checked = entry.heroNone !== true && (entry.heroes.length === 0 || entry.heroes.includes(hero.name))
                      return (
                        <label
                          key={hero.name}
                          htmlFor={id}
                          className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2 ${muted ? "opacity-40" : ""}`}
                        >
                          <Checkbox id={id} checked={checked} onCheckedChange={() => toggleHero(prefIndex, hero.name)} />
                          <span className="truncate text-sm">{hero.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </TabsContent>
          {(["ally", "avoid"] as const).map((key) => (
            <TabsContent key={key} value={key} className="mt-0 px-6 py-4">
              {roster.slice(0, format * 2).some((row, index) => index !== prefIndex && row.open) ? (
                <div className="space-y-1">
                  {roster.slice(0, format * 2).map((row, index) => {
                    if (index === prefIndex || !row.open) return null
                    const id = `${key}-${prefIndex}-${index}`
                    return (
                      <label key={index} htmlFor={id} className="flex h-9 cursor-pointer items-center gap-3 rounded-md border px-3">
                        <Checkbox id={id} checked={entry[key].includes(index)} onCheckedChange={() => togglePair(prefIndex, index, key)} />
                        <span className="truncate text-sm">{resolveSeatName(row, index)}</span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">添加其他玩家后可选择</p>
              )}
            </TabsContent>
          ))}
        </div>
        </ScrollArea>
      </div>
      <DialogFooter className="flex-row items-center justify-between gap-2 space-x-0 border-t px-6 py-4 sm:justify-between" data-pref-foot="">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-8 px-3" onClick={prefSelectAll}>全选</Button>
          <Button variant="outline" size="sm" className="h-8 px-3" onClick={prefClear}>清空</Button>
        </div>
        <Button size="sm" className="h-8 min-w-20 px-5" onClick={onDone}>完成</Button>
      </DialogFooter>
    </Tabs>
  )
}

function ResultPlaceholder({ format }: { format: Format }) {
  const rows = Array.from({ length: format }, (_, index) => index)
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
        <div className="h-5 w-5 shrink-0" />
        <div className="text-xl font-semibold leading-normal">&nbsp;</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(["blue", "red"] as const).map((side) => (
          <div
            key={side}
            className={`overflow-hidden rounded-lg border ${side === "blue" ? "border-l-4 border-l-blue" : "hidden border-l-4 border-l-red md:block"}`}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="font-display text-base font-semibold leading-normal">&nbsp;</div>
              <span className="text-sm leading-normal">&nbsp;</span>
            </div>
            <ul>
              {rows.map((row) => (
                <li key={row} className="flex items-center gap-3 border-t px-4 py-2.5">
                  <span className="h-10 w-10 shrink-0 rounded-md border" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-normal">&nbsp;</span>
                    <span className="block text-xs leading-normal">&nbsp;</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const saved = useMemo(() => loadSaved(), [])
  const boot = useMemo(() => hydrateCatalogs(saved), [saved])
  const [format, setFormat] = useState<Format>(() => saved?.format === 6 ? 6 : 5)
  const [roster, setRoster] = useState<RosterEntry[]>(() => revealSeats(padRoster(saved?.roster ?? []), saved?.format === 6 ? 6 : 5))
  const [players, setPlayers] = useState<PlayerProfile[]>(() => saved?.players ?? mergePlayers([], saved?.roster ?? []))
  const playersRef = useRef<PlayerProfile[]>([])
  playersRef.current = players
  const sessionRef = useRef(emptySession())
  const [prefIndex, setPrefIndex] = useState<number | null>(null)
  const [prefTab, setPrefTab] = useState("roles")
  const [rules, setRules] = useState<Rules>(() => normalizeRules(saved?.rules))
  const [heroes, setHeroes] = useState<Hero[]>(boot.heroes)
  const [maps, setMaps] = useState<GameMap[]>(boot.maps)
  const [collapsedHeroes, setCollapsedHeroes] = useState(saved?.collapsed ?? true)
  const [collapsedMaps, setCollapsedMaps] = useState(saved?.collapsedMaps ?? saved?.collapsed ?? true)
  const [collapsedRules, setCollapsedRules] = useState(saved?.collapsedRules ?? true)
  const [match, setMatch] = useState<Match | null>(null)
  const [poolOpen, setPoolOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryQuery, setLibraryQuery] = useState("")
  const [importSeat, setImportSeat] = useState<number | null>(null)
  const [importQuery, setImportQuery] = useState("")
  const [poolTab, setPoolTab] = useState<"heroes" | "maps">("heroes")
  const [draftHeroes, setDraftHeroes] = useState<Hero[]>([])
  const [draftMaps, setDraftMaps] = useState<GameMap[]>([])
  const [resetTarget, setResetTarget] = useState<"heroes" | "maps" | null>(null)
  const [cardBusy, setCardBusy] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const [cardAction, setCardAction] = useState<CardAction>(() => detectCardAction())
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const cardBlob = useRef<Blob | null>(null)
  const cardFile = useRef<File | null>(null)

  useEffect(() => {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search)
  }, [])

  useEffect(() => {
    setCardAction(detectCardAction())
  }, [])

  useEffect(() => {
    if (!match) {
      cardBlob.current = null
      cardFile.current = null
      setCardBusy(false)
      setCardReady(false)
      return
    }
    let cancelled = false
    cardBlob.current = null
    cardFile.current = null
    setCardReady(false)
    setCardBusy(true)
    void renderMatchCard(match, heroes).then((blob) => {
      if (cancelled) return
      const file = cardImageFile(blob)
      cardBlob.current = blob
      cardFile.current = file
      setCardReady(true)
      setCardBusy(false)
    }).catch(() => {
      if (cancelled) return
      cardBlob.current = null
      cardFile.current = null
      setCardReady(false)
      setCardBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [match, heroes])


  useEffect(() => {
    saveState({
      v: 1,
      format,
      roster,
      players,
      rules,
      collapsed: collapsedHeroes,
      collapsedMaps,
      collapsedRules,
      poolVersion: POOL_VERSION,
      heroes: Object.fromEntries(heroes.map((hero) => [hero.name, { enabled: hero.enabled, rating: hero.rating }])),
      maps: Object.fromEntries(maps.map((map) => [map.name, map.enabled])),
    })
  }, [format, roster, players, rules, collapsedHeroes, collapsedMaps, collapsedRules, heroes, maps])

  const heroOn = heroes.filter((hero) => hero.enabled).length
  const mapOn = maps.filter((map) => map.enabled).length

  function showToast(message: string) {
    toast.error(message, { icon: <TriangleAlert className="h-4 w-4" /> })
  }

  function showOk(message: string) {
    toast.success(message, { icon: <Check className="h-4 w-4 text-emerald-400" /> })
  }

  function commit(nextRoster: RosterEntry[], nextPlayers?: PlayerProfile[]) {
    const merged = mergePlayers(nextPlayers ?? playersRef.current, nextRoster)
    const paired = applyPlayerPairs(nextRoster, merged)
    playersRef.current = merged
    setPlayers(merged)
    setRoster(paired)
  }

  function deal() {
    try {
      setMatch(randomizeMatch(heroes, maps, roster, rules, format, sessionRef.current))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "对局生成失败")
    }
  }

  function switchFormat(next: Format) {
    if (next === format) return
    commit(revealSeats(remapRoster(roster, format, next), next))
    setPrefIndex((prev) => {
      const mapped = remapPrefIndex(prev, format, next)
      if (next === 5 && mapped != null && mapped >= 10) return null
      return mapped
    })
    setFormat(next)
    setMatch(null)
  }

  function vacateSeat(index: number) {
    commit(roster.map((entry, i) => {
      if (i === index) return emptySeat()
      return {
        ...entry,
        ally: entry.ally.filter((item) => item !== index),
        avoid: entry.avoid.filter((item) => item !== index),
      }
    }))
    if (prefIndex === index) setPrefIndex(null)
  }

  function draftSeatName(index: number, name: string) {
    setRoster((prev) => prev.map((entry, i) => (i === index ? { ...entry, name } : entry)))
  }

  function bindSeatName(index: number, raw: string) {
    const name = raw.trim().slice(0, 16)
    const playerId = seatedPlayerId(roster[index])
    if (!name) {
      commit(roster.map((entry, i) => (i === index ? { ...entry, name: "", playerId: "" } : entry)))
      return
    }
    if (playerId && findPlayer(playersRef.current, playerId)) {
      commit(
        roster.map((entry, i) => (i === index ? { ...entry, name } : entry)),
        renamePlayer(playersRef.current, playerId, name),
      )
      return
    }
    commit(roster.map((entry, i) => (i === index ? { ...entry, name, open: true } : entry)))
  }

  function pickPlayer(index: number, profile: PlayerProfile) {
    if (roster.some((entry, i) => i !== index && seatedPlayerId(entry) === profile.id)) {
      showToast("该收藏已存在于玩家名单中")
      return
    }
    const nextPlayers = playersRef.current.map((row) => (row.id === profile.id ? { ...row, seen: Date.now() } : row))
    commit(fillSeatFromProfile(roster, index, profile), nextPlayers)
  }

  function toggleRecord(index: number) {
    const name = seatedName(roster[index], index)
    if (!name) {
      showToast("玩家名称确缺失")
      return
    }
    const playerId = seatedPlayerId(roster[index])
    if (playerId && findPlayer(playersRef.current, playerId)) {
      commit(
        roster.map((entry, i) => (i === index ? { ...entry, playerId: "" } : entry)),
        deletePlayer(playersRef.current, playerId),
      )
      return
    }
    const id = newPlayerId()
    const extracted = extractPlayersFromRoster(roster.map((entry, i) => (i === index ? { ...entry, playerId: id } : entry))).find((row) => row.id === id)
    if (!extracted) return
    commit(
      roster.map((entry, i) => (i === index ? { ...entry, playerId: id } : entry)),
      [...playersRef.current, extracted],
    )
  }

  function removeFromLibrary(id: string) {
    commit(
      roster.map((entry) => (entry.playerId === id ? { ...entry, playerId: "" } : entry)),
      deletePlayer(playersRef.current, id),
    )
  }

  function clearLibrary() {
    const ids = new Set(playersRef.current.map((row) => row.id))
    commit(
      roster.map((entry) => (ids.has(entry.playerId) ? { ...entry, playerId: "" } : entry)),
      [],
    )
  }


  function togglePair(index: number, other: number, key: "ally" | "avoid") {
    if (index === other) return
    const left = seatedPlayerId(roster[index])
    const right = seatedPlayerId(roster[other])
    const linked = roster[index][key].includes(other) || roster[other][key].includes(index)
    const on = linked ? false : true
    const flip = key === "ally" ? "avoid" : "ally"
    const nextRoster = roster.map((entry, i) => {
      if (i !== index && i !== other) return entry
      const target = i === index ? other : index
      return {
        ...entry,
        [key]: on ? (entry[key].includes(target) ? entry[key] : [...entry[key], target]) : entry[key].filter((item) => item !== target),
        [flip]: entry[flip].filter((item) => item !== target),
      }
    })
    if (left && right && (findPlayer(playersRef.current, left) || findPlayer(playersRef.current, right))) {
      commit(nextRoster, setNamedPair(playersRef.current, left, right, key, on))
      return
    }
    setRoster(nextRoster)
  }

  function toggleHero(index: number, name: string) {
    const all = heroes.map((hero) => hero.name)
    commit(roster.map((entry, i) => {
      if (i !== index) return entry
      const current = entry.heroNone ? [] : entry.heroes.length ? entry.heroes : all
      const on = current.includes(name)
      const next = on ? current.filter((item) => item !== name) : [...current, name]
      if (!next.length) return { ...entry, heroes: [], heroNone: true }
      if (all.every((item) => next.includes(item))) return { ...entry, heroes: [], heroNone: false }
      return { ...entry, heroes: next, heroNone: false }
    }))
  }

  function prefSelectAll() {
    if (prefIndex === null) return
    const others = roster.slice(0, format * 2).map((_, index) => index).filter((index) => index !== prefIndex && roster[index].open)
    if (prefTab === "roles") patchRoster(prefIndex, { roles: [...ALL_ROLES] })
    else if (prefTab === "heroes") patchRoster(prefIndex, { heroes: [], heroNone: false })
    else if (prefTab === "ally" || prefTab === "avoid") {
      const self = seatedPlayerId(roster[prefIndex])
      if (self) {
        let nextPlayers = playersRef.current
        others.forEach((index) => {
          const id = seatedPlayerId(roster[index])
          if (id) nextPlayers = setNamedPair(nextPlayers, self, id, prefTab, true)
        })
        commit(roster, nextPlayers)
        return
      }
      const flip = prefTab === "ally" ? "avoid" : "ally"
      setRoster((prev) => prev.map((entry, i) => {
        if (i === prefIndex) return { ...entry, [prefTab]: others, [flip]: entry[flip].filter((item) => !others.includes(item)) }
        if (!others.includes(i)) return entry
        const onSelf = entry[prefTab].includes(prefIndex)
        return {
          ...entry,
          [prefTab]: onSelf ? entry[prefTab] : [...entry[prefTab], prefIndex],
          [flip]: entry[flip].filter((item) => item !== prefIndex),
        }
      }))
    }
  }

  function prefClear() {
    if (prefIndex === null) return
    if (prefTab === "roles") patchRoster(prefIndex, { roles: [] })
    else if (prefTab === "heroes") patchRoster(prefIndex, { heroes: [], heroNone: true })
    else if (prefTab === "ally" || prefTab === "avoid") {
      const self = seatedPlayerId(roster[prefIndex])
      if (self) {
        let nextPlayers = playersRef.current
        roster.slice(0, format * 2).forEach((entry) => {
          const id = seatedPlayerId(entry)
          if (id && id !== self) nextPlayers = setNamedPair(nextPlayers, self, id, prefTab, false)
        })
        commit(roster, nextPlayers)
        return
      }
      setRoster((prev) => prev.map((entry, i) => {
        if (i === prefIndex) return { ...entry, [prefTab]: [] }
        if (!entry[prefTab].includes(prefIndex)) return entry
        return { ...entry, [prefTab]: entry[prefTab].filter((item) => item !== prefIndex) }
      }))
    }
  }

  function patchRoster(index: number, patch: Partial<RosterEntry>) {
    if (patch.name != null) {
      draftSeatName(index, patch.name)
      return
    }
    commit(roster.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }


  function setRule(key: keyof Rules, value: boolean) {
    setRules((prev) => {
      const next = { ...prev, [key]: value }
      if (key === "teamsOnly" && value) next.rolesOnly = false
      if (key === "rolesOnly" && value) next.teamsOnly = false
      return next
    })
  }

  function patchDraftHero(name: string, patch: Partial<Hero>) {
    setDraftHeroes((prev) => prev.map((hero) => (hero.name === name ? { ...hero, ...patch } : hero)))
  }

  function patchDraftMap(name: string, enabled: boolean) {
    setDraftMaps((prev) => prev.map((map) => (map.name === name ? { ...map, enabled } : map)))
  }

  function confirmReset() {
    const target = resetTarget
    const next = hydrateCatalogs(null)
    if (target === "heroes") setHeroes(next.heroes)
    if (target === "maps") setMaps(next.maps)
    setResetTarget(null)
    if (target === "heroes") showOk("已重置英雄设置")
    if (target === "maps") showOk("已重置地图设置")
  }

  function openPool(tab: "heroes" | "maps") {
    setPoolTab(tab)
    setDraftHeroes(heroes.map((hero) => ({ ...hero })))
    setDraftMaps(maps.map((map) => ({ ...map })))
    setPoolOpen(true)
  }

  function commitPool() {
    if (poolTab === "heroes") setHeroes(draftHeroes)
    else setMaps(draftMaps)
    setPoolOpen(false)
    showOk(poolTab === "heroes" ? "已保存英雄设置" : "已保存地图设置")
  }
  function copyResult() {
    if (!match) return
    copyToClipboard(matchChatText(heroes, match)).then(() => {
      showOk("已成功复制结果")
    }).catch(() => {
      showToast("复制结果失败")
    })
  }


  function openSharePreview(blob: Blob) {
    setShareUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(blob)
    })
  }

  function copyCard() {
    const blob = cardBlob.current
    if (!blob) return
    if (cardAction === "share") {
      if (typeof navigator.share !== "function") {
        openSharePreview(blob)
        return
      }
      const file = new File([blob], "ow-card.png", { type: "image/png", lastModified: Date.now() })
      void navigator.share({ files: [file] }).then(() => {
        showOk("已成功分享")
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        openSharePreview(blob)
      })
      return
    }
    void navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => {
      showOk("已成功复制卡片")
    }).catch(() => {
      showToast("复制卡片失败")
    })
  }

  const grouped = TIER_RANK.slice().reverse()
    .map((tier) => ({ tier, list: heroes.filter((hero) => hero.rating === tier) }))
    .filter((row) => row.list.length)

  const present = new Set(maps.map((map) => map.mode))
  const modes = [...MODE_ORDER.filter((mode) => present.has(mode)), ...[...present].filter((mode) => !MODE_ORDER.includes(mode))]
  const importBusy = new Set(roster.map((entry) => seatedPlayerId(entry)).filter(Boolean))
  const importNeedle = importQuery.trim()
  const importList = sortPlayers(players).filter((row) => !importBusy.has(row.id) && (!importNeedle || row.name.includes(importNeedle)))
  const libraryList = sortPlayers(players).filter((row) => !libraryQuery.trim() || row.name.includes(libraryQuery.trim()))
  return (
    <div className="mx-auto min-h-screen w-[min(1120px,calc(100%-32px))] space-y-6 py-8 pb-16">
      <header>
        <h1 className="font-display text-[clamp(22px,5vw,40px)] font-bold tracking-tight">
          OW 对局生成器
        </h1>
      </header>

      <Card className="overflow-visible">
        <SectionHead
          title="玩家"
          hint="添加玩家名称与偏好"
          pin={(
            <Tabs value={String(format)} onValueChange={(value) => switchFormat(Number(value) as Format)}>
              <TabsList className="h-8 p-0.5">
                <TabsTrigger className="h-7 px-3" value="5">5v5</TabsTrigger>
                <TabsTrigger className="h-7 px-3" value="6">6v6</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        >
          <Button variant="outline" size="sm" className="h-8" onClick={() => { setLibraryQuery(""); setLibraryOpen(true) }}>
            <Star className="h-4 w-4" />
            收藏
          </Button>
        </SectionHead>
        <CardContent className="grid grid-cols-1 gap-2 overflow-visible sm:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col} className="divide-y overflow-visible rounded-lg border">
              {Array.from({ length: format }, (_, row) => {
                const index = col * format + row
                const entry = roster[index]
                return (
                  <SeatRow
                    key={index}
                    index={index}
                    entry={entry}
                    recorded={Boolean(seatedPlayerId(entry) && findPlayer(players, seatedPlayerId(entry)))}
                    onVacate={() => vacateSeat(index)}
                    onDraftName={(name) => draftSeatName(index, name)}
                    onBindName={(name) => bindSeatName(index, name)}
                    onPref={() => { setPrefTab("roles"); setPrefIndex(index) }}
                    onToggleRecord={() => toggleRecord(index)}
                    onImport={() => { setImportQuery(""); setImportSeat(index) }}
                  />
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>


      <Card>
        <SectionHead
          title="英雄"
          hint={`${heroOn}/${heroes.length}`}
          pinEnd
          pin={(
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCollapsedHeroes((v) => !v)}>
              {collapsedHeroes ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              {collapsedHeroes ? "展开" : "收起"}
            </Button>
          )}
        >
          <Button variant="outline" size="sm" className="h-8 hover:text-destructive" onClick={() => setResetTarget("heroes")}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => openPool("heroes")}>
            <Pencil className="h-4 w-4" />
            编辑
          </Button>
        </SectionHead>
        {collapsedHeroes ? null : (
          <CardContent className="space-y-3">
            {grouped.map((row) => (
              <div key={row.tier} className="flex gap-3">
                <Badge variant="outline" className="mt-0.5 h-6 w-10 shrink-0 justify-center px-0 font-mono text-primary">{row.tier}</Badge>
                <div className="flex flex-wrap gap-1.5">
                  {row.list.map((hero) => (
                    <Badge key={hero.name} variant={hero.enabled ? "secondary" : "muted"} title={`${hero.name} · ${hero.role}`}>
                      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${roleDot(hero.role)}`} />
                      {hero.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <SectionHead
          title="地图"
          hint={`${mapOn}/${maps.length}`}
          pinEnd
          pin={(
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCollapsedMaps((v) => !v)}>
              {collapsedMaps ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              {collapsedMaps ? "展开" : "收起"}
            </Button>
          )}
        >
          <Button variant="outline" size="sm" className="h-8 hover:text-destructive" onClick={() => setResetTarget("maps")}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => openPool("maps")}>
            <Pencil className="h-4 w-4" />
            编辑
          </Button>
        </SectionHead>
        {collapsedMaps ? null : (
          <CardContent className="space-y-3">
            {modes.map((mode) => {
              const list = maps.filter((map) => map.mode === mode)
              if (!list.length) return null
              return (
                <div key={mode} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-10 shrink-0 items-center justify-center">
                    <ModeGlyph mode={mode} className="h-5 w-5 text-primary" />
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((map) => (
                      <Badge key={map.name} variant={map.enabled ? "secondary" : "muted"}>{map.name}</Badge>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        )}
      </Card>

      <Card>
        <SectionHead
          title="规则"
          hint="设置对局规则"
          pinEnd
          pin={(
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCollapsedRules((v) => !v)}>
              {collapsedRules ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              {collapsedRules ? "展开" : "收起"}
            </Button>
          )}
        />
        {collapsedRules ? null : (
          <CardContent className="grid gap-6 sm:grid-cols-2">
            {RULE_GROUPS.map((group) => (
              <div key={group.title} className="min-w-0">
                <div className="mb-2 text-xs text-muted-foreground">{group.title}</div>
                <div className="divide-y rounded-lg border">
                  {group.items.map((item) => {
                    const disabled = ruleDisabled(item.key, rules)
                    const title = ruleTitle(item.key, item.title, rules)
                    return (
                      <div key={item.key} className={`flex items-center justify-between gap-3 px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
                        <Label htmlFor={item.key} className="text-sm font-normal">{title}</Label>
                        <Switch
                          id={item.key}
                          checked={disabled ? false : rules[item.key]}
                          disabled={disabled}
                          onCheckedChange={(value) => setRule(item.key, value)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <SectionHead
          title="结果"
          hint="展示选取结果"
          pinEnd
          pin={(
            <Button size="sm" className="h-8" onClick={deal}>
              <Shuffle className="h-4 w-4" />
              抽取
            </Button>
          )}
        >
          {match ? (
            <>
              <CopyTextButton onClick={copyResult} />
              <CopyCardButton
                busy={cardBusy}
                share={cardAction === "share"}
                disabled={cardBusy || !cardReady}
                onClick={copyCard}
              />
            </>
          ) : null}
        </SectionHead>
        <CardContent>
          {match ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <ModeGlyph mode={match.map.mode} className="h-5 w-5 shrink-0 text-primary" />
                <div className="text-xl font-semibold">
                  {match.map.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{match.map.mode}</span>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {match.teams.map((team, teamIndex) => {
                  const side = teamIndex === 0
                  return (
                    <div key={side ? "blue" : "red"} className={`overflow-hidden rounded-lg border ${side ? "border-l-4 border-l-blue" : "border-l-4 border-l-red"}`}>
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2 font-display text-base font-semibold">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${side ? "bg-blue" : "bg-red"}`} />
                          {side ? "蓝队" : "红队"}
                        </div>
                        {match.rolesOnly || match.teamsOnly ? null : <span className="text-sm text-muted-foreground">{teamScore(heroes, team)}分</span>}
                      </div>
                      <ul>
                        {team.map((player, playerIndex) => {
                          const hero = heroByName(heroes, player.hero)
                          const RoleIcon = ROLE_ICON[player.role]
                          const canReroll = rules.allowReroll && !match.teamsOnly && (!match.rolesOnly || !rules.balanceRoles)
                          return (
                            <li key={`${player.name}-${playerIndex}`} className="flex items-center gap-3 border-t px-4 py-2.5">
                              <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-muted">
                                {match.teamsOnly ? <QuestionMark className="h-5 w-5 text-muted-foreground" /> : match.rolesOnly ? <RoleIcon className="h-4 w-4" /> : hero ? <HeroPortrait hero={hero} /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{player.name}</span>
                                {match.teamsOnly ? null : (
                                  <span className="text-xs text-muted-foreground">{match.rolesOnly ? player.role : `${player.hero} · ${player.role} · ${hero?.rating}`}</span>
                                )}
                              </span>
                              {canReroll ? (
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`更换 ${player.name} 的${match.rolesOnly ? "职责" : "英雄"}`} onClick={() => setMatch(rerollSeat(heroes, match, rules, teamIndex as 0 | 1, playerIndex, roster, sessionRef.current))}>
                                  <RotateCw className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
              {match.audit.length ? (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">操作记录</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul>
                      {match.audit.map((item, index) => (
                        <li key={`${item.time}-${index}`} className="flex items-center justify-between gap-3 border-t px-4 py-2 text-sm">
                          <span>
                            {item.text}
                            {item.from ? <span className="whitespace-pre text-primary">{`  ${item.from}  →  ${item.to}`}</span> : null}
                          </span>
                          {item.time ? <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.time}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              className="relative cursor-pointer"
              onClick={deal}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  deal()
                }
              }}
            >
              <div className="pointer-events-none invisible">
                <ResultPlaceholder format={format} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-lg border transition-colors hover:bg-muted/40">
                <Empty className="border-0 p-0 md:p-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Shuffle />
                    </EmptyMedia>
                    <EmptyTitle>暂无对局</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <Dialog open={poolOpen} onOpenChange={setPoolOpen}>
        <DialogContent className="flex h-[85dvh] max-h-[85dvh] w-[calc(100%-2rem)] max-w-4xl flex-col overflow-hidden p-0">
          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <DialogHeader className="px-6 pb-4 pt-6">
            <DialogTitle>{poolTab === "maps" ? "地图" : "英雄"}</DialogTitle>
            <DialogDescription>
              {poolTab === "maps" ? "设置可用地图" : "设置可用英雄及其评级"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-hidden border-y">
            <ScrollArea className="h-full">
              <div className="px-6 py-4">
            {poolTab === "heroes" ? (
              (["坦克", "输出", "支援"] as Role[]).map((role) => {
                const list = draftHeroes.filter((hero) => hero.role === role)
                const on = list.filter((hero) => hero.enabled).length
                return (
                  <section key={role} className="mb-5 last:mb-0">
                    <div className="mb-3 text-sm font-medium">{role} {on}/{list.length}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((hero) => (
                        <div key={hero.name} className="grid grid-cols-[18px_1fr_88px] items-center gap-2 rounded-md border px-2 py-2">
                          <Checkbox checked={hero.enabled} onCheckedChange={(value) => patchDraftHero(hero.name, { enabled: Boolean(value) })} />
                          <span className="truncate text-sm">{hero.name}</span>
                          <Select value={hero.rating} onValueChange={(value) => patchDraftHero(hero.name, { rating: value as Tier })}>
                            <SelectTrigger className="h-8" aria-label={`${hero.name} 评级`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[...TIER_RANK].reverse().map((tier) => (
                                <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })
            ) : (
              modes.map((mode) => {
                const list = draftMaps.filter((map) => map.mode === mode)
                const on = list.filter((map) => map.enabled).length
                return (
                  <section key={mode} className="mb-5 last:mb-0">
                    <div className="mb-3 text-sm font-medium">{mode} {on}/{list.length}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((map) => (
                        <label key={map.name} className="flex items-center gap-2 rounded-md border px-2 py-2 text-sm">
                          <Checkbox checked={map.enabled} onCheckedChange={(value) => patchDraftMap(map.name, Boolean(value))} />
                          <span>{map.name}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                )
              })
            )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-2 space-x-0 px-6 py-4 sm:justify-between">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => {
                if (poolTab === "heroes") setDraftHeroes((prev) => prev.map((hero) => ({ ...hero, enabled: true })))
                else setDraftMaps((prev) => prev.map((map) => ({ ...map, enabled: true })))
              }}>全选</Button>
              <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => {
                if (poolTab === "heroes") setDraftHeroes((prev) => prev.map((hero) => ({ ...hero, enabled: false })))
                else setDraftMaps((prev) => prev.map((map) => ({ ...map, enabled: false })))
              }}>清空</Button>
            </div>
            <Button size="sm" className="h-8 min-w-20 px-5" onClick={commitPool}>完成</Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importSeat !== null} onOpenChange={(open) => { if (!open) setImportSeat(null) }}>
        <DialogContent className="flex max-h-[min(36rem,85dvh)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-3 border-b px-6 pb-4 pt-6 pr-12">
            <div className="space-y-1.5">
              <DialogTitle>收藏</DialogTitle>
              <DialogDescription>从收藏列表中导入玩家</DialogDescription>
            </div>
            {players.length >= FAVORITE_FILTER_MIN ? (
              <ListFilter
                value={importQuery}
                autoFocus
                onChange={setImportQuery}
                onEnter={() => {
                  if (!importList.length || importSeat === null) return
                  pickPlayer(importSeat, importList[0])
                  setImportSeat(null)
                }}
              />
            ) : null}
          </DialogHeader>
          <div className={`min-h-[12rem] px-3 ${importList.length ? "min-h-0 flex-1 py-2" : "flex flex-1 items-center justify-center"}`}>
            {!importList.length ? (
              <p className="text-sm text-muted-foreground">暂无收藏</p>
            ) : (
              <ScrollArea className="h-full min-h-[12rem]">
              <ul className="w-full space-y-0.5">
                {importList.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent"
                      onClick={() => {
                        if (importSeat !== null) pickPlayer(importSeat, row)
                        setImportSeat(null)
                      }}
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatFavoriteDate(row.created)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryOpen} onOpenChange={(open) => { setLibraryOpen(open); if (!open) setLibraryQuery("") }}>
        <DialogContent className="flex max-h-[min(36rem,85dvh)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-3 border-b px-6 pb-4 pt-6 pr-12">
            <div className="space-y-1.5">
              <DialogTitle>收藏</DialogTitle>
              <DialogDescription>管理收藏列表</DialogDescription>
            </div>
            {players.length >= FAVORITE_FILTER_MIN ? (
              <ListFilter value={libraryQuery} onChange={setLibraryQuery} />
            ) : null}
          </DialogHeader>
          <div className={`min-h-[12rem] px-3 ${libraryList.length ? "min-h-0 flex-1 py-2" : "flex flex-1 items-center justify-center"}`}>
            {!libraryList.length ? (
              <p className="text-sm text-muted-foreground">暂无收藏</p>
            ) : (
              <ScrollArea className="h-full min-h-[12rem]">
              <ul className="w-full space-y-0.5">
                {libraryList.map((row) => {
                  const here = roster.some((entry) => seatedPlayerId(entry) === row.id)
                  return (
                    <li key={row.id} className="flex items-center gap-3 rounded-md px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                      {here ? <Badge variant="secondary">使用中</Badge> : null}
                      <span className="shrink-0 text-xs text-muted-foreground">{formatFavoriteDate(row.created)}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`移除收藏 ${row.name}`} onClick={() => removeFromLibrary(row.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
              </ScrollArea>
            )}
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-2 space-x-0 border-t px-6 py-4 sm:justify-between">
            <Button variant="outline" size="sm" className="h-8 px-3" disabled={!players.length} onClick={clearLibrary}>清空</Button>
            <Button size="sm" className="h-8 min-w-20 px-5" onClick={() => setLibraryOpen(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) setResetTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resetTarget === "maps" ? "重置地图" : "重置英雄"}</DialogTitle>
            <DialogDescription>
              {resetTarget === "maps" ? "地图状态会恢复初始状态" : "英雄状态及其评级会恢复初始状态"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" className="h-8 px-5" onClick={() => setResetTarget(null)}>取消</Button>
            <Button size="sm" className="h-8 px-5" onClick={confirmReset}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={prefIndex !== null} onOpenChange={(open) => { if (!open) setPrefIndex(null) }}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
          {prefIndex !== null && roster[prefIndex] ? (
            <PrefTabs
              prefTab={prefTab}
              setPrefTab={setPrefTab}
              prefIndex={prefIndex}
              roster={roster}
              format={format}
              heroes={heroes}
              patchRoster={patchRoster}
              toggleHero={toggleHero}
              togglePair={togglePair}
              prefSelectAll={prefSelectAll}
              prefClear={prefClear}
              onDone={() => {
                setPrefIndex(null)
                showOk("已保存偏好设置")
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={shareUrl !== null} onOpenChange={(open) => {
        if (open) return
        setShareUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      }}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-md gap-3 overflow-hidden p-5">
          <DialogHeader>
            <DialogTitle>卡片分享</DialogTitle>
            <DialogDescription>长按卡片保存或分享</DialogDescription>
          </DialogHeader>
          {shareUrl ? (
            <img
              src={shareUrl}
              alt="对局卡片"
              className="max-h-[min(70dvh,32rem)] w-full select-auto rounded-md object-contain"
              style={{ WebkitTouchCallout: "default" }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <footer className="pt-4 text-center text-xs text-muted-foreground">
        © 2026 xbx0721 · MIT License
        <span className="mx-1.5">·</span>
        与暴雪娱乐无关
      </footer>

    </div>
  )
}
