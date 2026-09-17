import { poolDefaults } from "./pool"

export type GameMap = {
  name: string
  mode: string
  enabled: boolean
}

export const MODE_ORDER = [
  "占领要点",
  "护送",
  "攻击/护送",
  "机动推进",
  "闪点作战",
  "角斗领域 · 占领要点",
  "角斗领域 · 机动推进",
  "角斗领域 · 运载竞速",
  "角斗领域 · 对阵",
  "攻防作战",
  "死斗",
  "决斗/淘汰",
  "占领旗帜",
]

export const MAP_CATALOG: GameMap[] = [
  { name: "伊利奥斯", mode: "占领要点", enabled: true },
  { name: "漓江塔", mode: "占领要点", enabled: true },
  { name: "尼泊尔", mode: "占领要点", enabled: true },
  { name: "釜山", mode: "占领要点", enabled: true },
  { name: "绿洲城", mode: "占领要点", enabled: true },
  { name: "南极半岛", mode: "占领要点", enabled: true },
  { name: "萨摩亚", mode: "占领要点", enabled: true },
  { name: "多拉多", mode: "护送", enabled: true },
  { name: "66号公路", mode: "护送", enabled: true },
  { name: "监测站：直布罗陀", mode: "护送", enabled: true },
  { name: "皇家赛道", mode: "护送", enabled: true },
  { name: "哈瓦那", mode: "护送", enabled: true },
  { name: "香巴里寺院", mode: "护送", enabled: true },
  { name: "渣客镇", mode: "护送", enabled: true },
  { name: "里阿尔托", mode: "护送", enabled: true },
  { name: "监测站：格里姆火山", mode: "护送", enabled: false },
  { name: "国王大道", mode: "攻击/护送", enabled: true },
  { name: "好莱坞", mode: "攻击/护送", enabled: true },
  { name: "努巴尼", mode: "攻击/护送", enabled: true },
  { name: "艾兴瓦尔德", mode: "攻击/护送", enabled: true },
  { name: "暴雪世界", mode: "攻击/护送", enabled: true },
  { name: "中城", mode: "攻击/护送", enabled: true },
  { name: "帕拉伊苏", mode: "攻击/护送", enabled: true },
  { name: "霓虹枢纽", mode: "攻击/护送", enabled: true },
  { name: "新皇后街", mode: "机动推进", enabled: true },
  { name: "埃斯佩兰萨", mode: "机动推进", enabled: true },
  { name: "斗兽场", mode: "机动推进", enabled: true },
  { name: "鲁纳塞彼", mode: "机动推进", enabled: true },
  { name: "新渣客城", mode: "闪点作战", enabled: true },
  { name: "苏拉瓦萨", mode: "闪点作战", enabled: true },
  { name: "阿特利斯", mode: "闪点作战", enabled: true },
  { name: "维多利亚竞技场", mode: "角斗领域 · 占领要点", enabled: false },
  { name: "五行大学·水学院", mode: "角斗领域 · 占领要点", enabled: false },
  { name: "红木大坝", mode: "角斗领域 · 机动推进", enabled: false },
  { name: "塞伦扎", mode: "角斗领域 · 机动推进", enabled: false },
  { name: "拉克鲁瓦广场", mode: "角斗领域 · 机动推进", enabled: false },
  { name: "火药桶矿井", mode: "角斗领域 · 运载竞速", enabled: false },
  { name: "泰晤士区", mode: "角斗领域 · 运载竞速", enabled: false },
  { name: "花冈", mode: "角斗领域 · 对阵", enabled: false },
  { name: "阿努比斯王座", mode: "角斗领域 · 对阵", enabled: false },
  { name: "花村", mode: "攻防作战", enabled: false },
  { name: "阿努比斯神殿", mode: "攻防作战", enabled: false },
  { name: "沃斯卡娅工业区", mode: "攻防作战", enabled: false },
  { name: "“地平线”月球基地", mode: "攻防作战", enabled: false },
  { name: "巴黎", mode: "攻防作战", enabled: false },
  { name: "吉拉德堡", mode: "死斗", enabled: false },
  { name: "铁坂", mode: "死斗", enabled: false },
  { name: "马莱温多", mode: "死斗", enabled: false },
  { name: "佩特拉", mode: "死斗", enabled: false },
  { name: "黑森林", mode: "决斗/淘汰", enabled: false },
  { name: "城堡", mode: "决斗/淘汰", enabled: false },
  { name: "生态监测站：南极洲", mode: "决斗/淘汰", enabled: false },
  { name: "墓园", mode: "决斗/淘汰", enabled: false },
  { name: "阿育陀耶", mode: "占领旗帜", enabled: false },
]

export function createMaps(): GameMap[] {
  return MAP_CATALOG.map((map) => ({
    ...map,
    enabled: typeof poolDefaults.maps[map.name] === "boolean" ? poolDefaults.maps[map.name] : map.enabled,
  }))
}
