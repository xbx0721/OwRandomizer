import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

function stampPoolDefaults() {
  const file = path.join(root, "src/data/pool-defaults.json")
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    version?: string
    hash?: string
    heroes: Record<string, { rating: string; enabled: boolean }>
    maps: Record<string, boolean>
  }
  const payload = JSON.stringify({ heroes: data.heroes, maps: data.maps })
  const hash = crypto.createHash("sha256").update(payload).digest("hex")
  if (data.hash === hash && data.version) return
  const now = new Date()
  const z = (n: number) => String(n).padStart(2, "0")
  const version = `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}-${z(now.getHours())}-${z(now.getMinutes())}-${z(now.getSeconds())}`
  fs.writeFileSync(file, `${JSON.stringify({ version, hash, heroes: data.heroes, maps: data.maps }, null, 2)}\n`)
}

const CDN = "https://d15f34w2p8l1cc.cloudfront.net/overwatch/"

async function ensurePortraits() {
  const dir = path.join(root, "public/portraits")
  fs.mkdirSync(dir, { recursive: true })
  const src = fs.readFileSync(path.join(root, "src/data/heroes.ts"), "utf8")
  const hashes = [...src.matchAll(/hash: "([a-f0-9]{64})"/g)].map((row) => row[1])
  const missing = hashes.filter((hash) => {
    const dest = path.join(dir, `${hash}.png`)
    return !fs.existsSync(dest) || fs.statSync(dest).size < 1000
  })
  if (!missing.length) return
  await Promise.all(missing.map(async (hash) => {
    const res = await fetch(`${CDN}${hash}.png`)
    if (!res.ok) return
    fs.writeFileSync(path.join(dir, `${hash}.png`), Buffer.from(await res.arrayBuffer()))
  }))
}

export default defineConfig(async () => {
  stampPoolDefaults()
  await ensurePortraits()
  return {
    base: "./",
    plugins: [react()],
    resolve: {
      alias: { "@": path.join(root, "src") },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      watch: { usePolling: true, interval: 300 },
    },
  }
})
