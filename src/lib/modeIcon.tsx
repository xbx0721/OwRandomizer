import {
  Bot,
  Castle,
  CircleDot,
  Flag,
  Map as MapIcon,
  Skull,
  Swords,
  Truck,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react"

const MODE_ICON: Record<string, LucideIcon> = {
  占领要点: CircleDot,
  护送: Truck,
  "攻击/护送": Waypoints,
  机动推进: Bot,
  闪点作战: Zap,
  运载竞速: Truck,
  对阵: Swords,
  攻防作战: Castle,
  死斗: Skull,
  "决斗/淘汰": Swords,
  占领旗帜: Flag,
}

export function modeIcon(mode?: string): LucideIcon {
  if (!mode) return MapIcon
  const base = mode.replace(/^角斗领域 · /, "")
  return MODE_ICON[base] ?? MapIcon
}

export function ModeGlyph({ mode, className }: { mode?: string; className?: string }) {
  const Icon = modeIcon(mode)
  return (
    <span title={mode} className="inline-flex">
      <Icon className={className} />
    </span>
  )
}
