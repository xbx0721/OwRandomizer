import { portraitUrl, type Hero } from "../data/heroes"
import { heroByName, teamScore, type Match } from "./game"

const W = 960
const PAD = 32
const GAP = 16
const ROW = 56
const TEAM_HEAD = 44
const HEADER = 72
const SCALE = 2

const BG = "#0f1218"
const CARD = "#181c24"
const INK = "#efe8dc"
const MUTED = "#9a9388"
const LINE = "#2a313c"
const BLUE = "#4a7eae"
const RED = "#c45c56"

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let value = text
  while (value.length && ctx.measureText(`${value}…`).width > max) value = value.slice(0, -1)
  return `${value}…`
}

async function loadPortrait(hero: Hero | undefined) {
  if (!hero) return null
  const url = portraitUrl(hero)
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

export async function renderMatchCard(match: Match, heroes: Hero[]): Promise<Blob> {
  await document.fonts.ready
  await Promise.all([
    document.fonts.load("700 28px \"IBM Plex Sans Condensed\""),
    document.fonts.load("600 16px \"Noto Sans SC\""),
    document.fonts.load("400 14px \"Noto Sans SC\""),
  ]).catch(() => undefined)

  const rows = match.format
  const height = PAD + HEADER + TEAM_HEAD + rows * ROW + PAD
  const canvas = document.createElement("canvas")
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas")
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, height)

  ctx.fillStyle = INK
  ctx.font = "700 28px \"IBM Plex Sans Condensed\", \"Noto Sans SC\", sans-serif"
  ctx.fillText("OW 对局生成器", PAD, PAD + 32)
  ctx.fillStyle = MUTED
  ctx.font = "400 14px \"Noto Sans SC\", sans-serif"
  ctx.textAlign = "right"
  ctx.fillText(`${match.format}v${match.format}  ·  ${match.map.name}  ·  ${match.map.mode}`, W - PAD, PAD + 32)
  ctx.textAlign = "left"
  const colW = (W - PAD * 2 - GAP) / 2
  const portraits = match.rolesOnly || match.teamsOnly
    ? []
    : await Promise.all(
      match.teams.flatMap((team) => team.map((player) => loadPortrait(heroByName(heroes, player.hero)))),
    )
  const roleFill: Record<string, string> = { 坦克: "#c9a227", 输出: "#c45c56", 支援: "#3d9a8c" }

  match.teams.forEach((team, teamIndex) => {
    const x = PAD + teamIndex * (colW + GAP)
    const y = PAD + HEADER
    const h = TEAM_HEAD + rows * ROW
    const accent = teamIndex === 0 ? BLUE : RED
    ctx.fillStyle = CARD
    roundRect(ctx, x, y, colW, h, 8)
    ctx.fill()
    ctx.fillStyle = accent
    ctx.fillRect(x, y, 4, h)

    ctx.fillStyle = INK
    ctx.font = "600 16px \"Noto Sans SC\", sans-serif"
    ctx.fillText(teamIndex === 0 ? "蓝队" : "红队", x + 16, y + 28)
    if (!match.rolesOnly && !match.teamsOnly) {
      ctx.fillStyle = MUTED
      ctx.font = "400 13px \"Noto Sans SC\", sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(`${teamScore(heroes, team)}分`, x + colW - 16, y + 28)
      ctx.textAlign = "left"
    }

    team.forEach((player, index) => {
      const py = y + TEAM_HEAD + index * ROW
      ctx.strokeStyle = LINE
      ctx.beginPath()
      ctx.moveTo(x + 4, py)
      ctx.lineTo(x + colW, py)
      ctx.stroke()

      const imgX = x + 12
      const imgY = py + 8
      const imgS = 40
      ctx.save()
      roundRect(ctx, imgX, imgY, imgS, imgS, 6)
      ctx.clip()
      if (match.teamsOnly) {
        ctx.fillStyle = LINE
        ctx.fillRect(imgX, imgY, imgS, imgS)
        ctx.fillStyle = MUTED
        ctx.font = "700 22px \"IBM Plex Sans Condensed\", sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("?", imgX + imgS / 2, imgY + imgS / 2 + 1)
        ctx.textAlign = "left"
        ctx.textBaseline = "alphabetic"
      } else if (match.rolesOnly) {
        ctx.fillStyle = roleFill[player.role] ?? LINE
        ctx.fillRect(imgX, imgY, imgS, imgS)
      } else {
        const portrait = portraits[teamIndex * rows + index]
        if (portrait) ctx.drawImage(portrait, imgX, imgY, imgS, imgS)
        else {
          ctx.fillStyle = LINE
          ctx.fillRect(imgX, imgY, imgS, imgS)
        }
      }
      ctx.restore()

      const textX = imgX + imgS + 10
      const max = colW - (textX - x) - 12
      ctx.fillStyle = INK
      ctx.font = "500 14px \"Noto Sans SC\", sans-serif"
      ctx.fillText(ellipsis(ctx, player.name, max), textX, py + 24)
      if (!match.teamsOnly) {
        ctx.fillStyle = MUTED
        ctx.font = "400 12px \"Noto Sans SC\", sans-serif"
        const sub = match.rolesOnly ? player.role : `${player.hero} · ${player.role}${heroByName(heroes, player.hero) ? ` · ${heroByName(heroes, player.hero)?.rating}` : ""}`
        ctx.fillText(ellipsis(ctx, sub, max), textX, py + 42)
      }
    })
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("empty image")
  return blob
}

export function cardImageFile(blob: Blob) {
  return new File([blob], "ow-card.png", { type: "image/png" })
}


export function saveCardPng(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "ow-card.png"
  a.target = "_blank"
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
