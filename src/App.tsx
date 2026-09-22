import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, ChevronUp, Copy, Crosshair, Heart, Image, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, RotateCw, Settings2, Share2, Shield, Shuffle, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"
import { HeroPortrait } from "./components/HeroPortrait"
import { cardImageFile, renderMatchCard } from "./lib/shareCard"
import { ModeGlyph } from "./lib/modeIcon"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card"
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
  defaultRules,
  emptySeat,
  heroByName,
  hydrateCatalogs,
  loadSaved,
  matchChatText,
  padRoster,
  remapPrefIndex,
  remapRoster,
  randomizeMatch,
  rerollSeat,
  resolveSeatName,
  saveState,
  seatLabel,
  teamScore,
  type Format,
  type GameMap,
  type Hero,
  type Match,
  type Role,
  type RosterEntry,
  type Rules,
  type Tier,
} from "./lib/game"

const RULE_COPY: { key: keyof Rules; title: string }[] = [
  { key: "rolesOnly", title: "仅分配职责" },
  { key: "balanceRoles", title: "平衡队伍职责" },
  { key: "balanceRatings", title: "平衡英雄评级" },
  { key: "allowRepeat", title: "允许重复英雄" },
  { key: "allowReroll", title: "允许重选英雄" },
]

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
  const [roster, setRoster] = useState<RosterEntry[]>(() => padRoster(saved?.roster ?? []))
  const [prefIndex, setPrefIndex] = useState<number | null>(null)
  const [prefTab, setPrefTab] = useState("roles")
  const [rules, setRules] = useState<Rules>(() => ({ ...defaultRules(), ...saved?.rules }))
  const [heroes, setHeroes] = useState<Hero[]>(boot.heroes)
  const [maps, setMaps] = useState<GameMap[]>(boot.maps)
  const [collapsedHeroes, setCollapsedHeroes] = useState(saved?.collapsed ?? true)
  const [collapsedMaps, setCollapsedMaps] = useState(saved?.collapsedMaps ?? saved?.collapsed ?? true)
  const [match, setMatch] = useState<Match | null>(null)
  const [poolOpen, setPoolOpen] = useState(false)
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
      rules,
      collapsed: collapsedHeroes,
      collapsedMaps,
      poolVersion: POOL_VERSION,
      heroes: Object.fromEntries(heroes.map((hero) => [hero.name, { enabled: hero.enabled, rating: hero.rating }])),
      maps: Object.fromEntries(maps.map((map) => [map.name, map.enabled])),
    })
  }, [format, roster, rules, collapsedHeroes, collapsedMaps, heroes, maps])

  const heroOn = heroes.filter((hero) => hero.enabled).length
  const mapOn = maps.filter((map) => map.enabled).length

  function showToast(message: string) {
    toast.error(message, { icon: <TriangleAlert className="h-4 w-4" /> })
  }

  function showOk(message: string) {
    toast.success(message, { icon: <Check className="h-4 w-4 text-emerald-400" /> })
  }

  function deal() {
    try {
      setMatch(randomizeMatch(heroes, maps, roster, rules, format))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "对局生成失败")
    }
  }

  function switchFormat(next: Format) {
    if (next === format) return
    setRoster((prev) => remapRoster(prev, format, next))
    setPrefIndex((prev) => remapPrefIndex(prev, format, next))
    setFormat(next)
    setMatch(null)
  }

  function openSeat(index: number) {
    setRoster((prev) => prev.map((entry, i) => (i === index ? { ...entry, open: true } : entry)))
  }

  function vacateSeat(index: number) {
    setRoster((prev) => prev.map((entry, i) => {
      if (i === index) return emptySeat()
      if (!entry.avoid.includes(index)) return entry
      return { ...entry, avoid: entry.avoid.filter((item) => item !== index) }
    }))
    if (prefIndex === index) setPrefIndex(null)
  }

  function toggleAvoid(index: number, other: number) {
    if (index === other) return
    setRoster((prev) => prev.map((entry, i) => {
      if (i !== index && i !== other) return entry
      const target = i === index ? other : index
      const on = entry.avoid.includes(target)
      return { ...entry, avoid: on ? entry.avoid.filter((item) => item !== target) : [...entry.avoid, target] }
    }))
  }

  function toggleHero(index: number, name: string) {
    const all = heroes.map((hero) => hero.name)
    setRoster((prev) => prev.map((entry, i) => {
      if (i !== index) return entry
      const current = entry.heroes.length ? entry.heroes : all
      const on = current.includes(name)
      const next = on ? current.filter((item) => item !== name) : [...current, name]
      if (!next.length) return entry
      return { ...entry, heroes: all.every((item) => next.includes(item)) ? [] : next }
    }))
  }

  function patchRoster(index: number, patch: Partial<RosterEntry>) {
    setRoster((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  function setRule(key: keyof Rules, value: boolean) {
    setRules((prev) => ({ ...prev, [key]: value }))
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

  return (
    <div className="mx-auto min-h-screen w-[min(1120px,calc(100%-32px))] space-y-6 py-8 pb-16">
      <header>
        <h1 className="font-display text-[clamp(22px,5vw,40px)] font-bold tracking-tight">
          OW 对局生成器
        </h1>
      </header>

      <Card>
        <SectionHead
          title="设置"
          hint="设置玩家名单与规则"
          pin={(
            <Tabs value={String(format)} onValueChange={(value) => switchFormat(Number(value) as Format)}>
              <TabsList className="h-8 p-0.5">
                <TabsTrigger className="h-7 px-3" value="5">5v5</TabsTrigger>
                <TabsTrigger className="h-7 px-3" value="6">6v6</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        />
        <CardContent className={`grid grid-cols-1 gap-2 sm:grid-cols-2 sm:grid-flow-col ${format === 6 ? "sm:grid-rows-6" : "sm:grid-rows-5"}`}>
          {roster.slice(0, format * 2).map((entry, index) => (
            <div
              key={index}
              className={`flex h-11 items-center gap-2 rounded-lg border px-2 ${entry.open ? "bg-background" : "border-dashed"}`}
            >
              {entry.open ? (
                <>
                  <span className="w-7 shrink-0 pr-1 text-right font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <Input
                    maxLength={16}
                    value={entry.name}
                    placeholder={seatLabel(index)}
                    aria-label={seatLabel(index)}
                    className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    onChange={(event) => patchRoster(index, { name: event.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`设置玩家 ${resolveSeatName(entry, index)} 的偏好`} onClick={() => { setPrefTab("roles"); setPrefIndex(index) }}>
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`移除玩家 ${resolveSeatName(entry, index)}`} onClick={() => vacateSeat(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => openSeat(index)}>
                  <Plus className="h-4 w-4" />
                  添加玩家
                </button>
              )}
            </div>
          ))}
        </CardContent>
        <CardFooter className="grid grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {RULE_COPY.map((item) => {
            const heroRule = item.key === "allowRepeat" || item.key === "balanceRatings"
            const disabled = (heroRule && rules.rolesOnly) || (item.key === "allowReroll" && rules.rolesOnly && rules.balanceRoles)
            const title = item.key === "allowReroll" && rules.rolesOnly ? "允许重选职责" : item.title
            return (
            <div key={item.key} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
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
        </CardFooter>
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
                        {match.rolesOnly ? null : <span className="text-sm text-muted-foreground">{teamScore(heroes, team)}分</span>}
                      </div>
                      <ul>
                        {team.map((player, playerIndex) => {
                          const hero = heroByName(heroes, player.hero)
                          const RoleIcon = ROLE_ICON[player.role]
                          const canReroll = rules.allowReroll && (!match.rolesOnly || !rules.balanceRoles)
                          return (
                            <li key={`${player.name}-${playerIndex}`} className="flex items-center gap-3 border-t px-4 py-2.5">
                              <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-muted">
                                {match.rolesOnly ? <RoleIcon className="h-4 w-4" /> : hero ? <HeroPortrait hero={hero} /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{player.name}</span>
                                <span className="text-xs text-muted-foreground">{match.rolesOnly ? player.role : `${player.hero} · ${player.role} · ${hero?.rating}`}</span>
                              </span>
                              {canReroll ? (
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`更换 ${player.name} 的${match.rolesOnly ? "职责" : "英雄"}`} onClick={() => setMatch(rerollSeat(heroes, match, rules, teamIndex as 0 | 1, playerIndex, roster))}>
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
        <DialogContent className="flex max-h-[85dvh] flex-col gap-4 overflow-hidden p-5 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>偏好设置</DialogTitle>
            <DialogDescription>
              {prefIndex !== null ? `设置玩家 ${resolveSeatName(roster[prefIndex], prefIndex)} 的偏好` : "设置玩家偏好"}
            </DialogDescription>
          </DialogHeader>
          {prefIndex !== null && roster[prefIndex] ? (
            <Tabs value={prefTab} onValueChange={setPrefTab} className="flex min-h-0 flex-1 flex-col">
              <TabsList className="grid h-8 w-full grid-cols-3 p-0.5">
                <TabsTrigger className="h-7 px-2" value="roles">职责</TabsTrigger>
                <TabsTrigger className="h-7 px-2" value="heroes">英雄</TabsTrigger>
                <TabsTrigger className="h-7 px-2" value="avoid">避免</TabsTrigger>
              </TabsList>
              <TabsContent value="roles" className="mt-4">
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  value={roster[prefIndex].roles}
                  onValueChange={(next) => {
                    if (next.length) patchRoster(prefIndex, { roles: next as Role[] })
                  }}
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
              <TabsContent value="heroes" className="mt-4 min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col">
                <ScrollArea className="h-[min(50dvh,24rem)]">
                  <div className="space-y-4 pr-3">
                    {ALL_ROLES.map((role) => {
                      const list = heroes.filter((hero) => hero.role === role)
                      const muted = !roster[prefIndex].roles.includes(role)
                      return (
                        <section key={role}>
                          <div className={`mb-2 text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}>{role}</div>
                          <div className="grid grid-cols-2 gap-1">
                            {list.map((hero) => {
                              const id = `pref-hero-${prefIndex}-${hero.name}`
                              const checked = !roster[prefIndex].heroes.length || roster[prefIndex].heroes.includes(hero.name)
                              return (
                                <label
                                  key={hero.name}
                                  htmlFor={id}
                                  className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2 ${muted ? "opacity-40" : ""}`}
                                >
                                  <Checkbox
                                    id={id}
                                    checked={checked}
                                    onCheckedChange={() => toggleHero(prefIndex, hero.name)}
                                  />
                                  <span className="truncate text-sm">{hero.name}</span>
                                </label>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="avoid" className="mt-4 min-h-0 data-[state=active]:flex data-[state=active]:flex-1 data-[state=active]:flex-col">
                {roster.slice(0, format * 2).some((entry, index) => index !== prefIndex && entry.open) ? (
                  <ScrollArea className="h-[min(50dvh,24rem)]">
                    <div className="space-y-1 pr-3">
                      {roster.slice(0, format * 2).map((entry, index) => {
                        if (index === prefIndex || !entry.open) return null
                        const id = `avoid-${prefIndex}-${index}`
                        return (
                          <label key={index} htmlFor={id} className="flex h-9 cursor-pointer items-center gap-3 rounded-md border px-3">
                            <Checkbox
                              id={id}
                              checked={roster[prefIndex].avoid.includes(index)}
                              onCheckedChange={() => toggleAvoid(prefIndex, index)}
                            />
                            <span className="truncate text-sm">{resolveSeatName(entry, index)}</span>
                          </label>
                        )
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">添加其他玩家后可选择</p>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
          <DialogFooter className="sm:justify-stretch">
            <Button size="sm" className="h-8 w-full" onClick={() => {
              setPrefIndex(null)
              showOk("已保存偏好设置")
            }}>完成</Button>
          </DialogFooter>
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
    </div>
  )
}
