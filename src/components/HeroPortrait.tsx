import { useEffect, useRef, useState } from "react"
import { portraitUrl, type Hero } from "../data/heroes"

const MAX_TRIES = 3

export function HeroPortrait({ hero }: { hero: Hero }) {
  const base = portraitUrl(hero)
  const [src, setSrc] = useState(base)
  const [failed, setFailed] = useState(!base)
  const tries = useRef(0)
  const timer = useRef(0)

  useEffect(() => {
    setSrc(base)
    setFailed(!base)
    tries.current = 0
    window.clearTimeout(timer.current)
    return () => window.clearTimeout(timer.current)
  }, [base])

  if (failed || !src) return null

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => {
        if (tries.current >= MAX_TRIES) {
          setFailed(true)
          return
        }
        tries.current += 1
        const n = tries.current
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          const sep = base.includes("?") ? "&" : "?"
          setSrc(`${base}${sep}retry=${n}&t=${Date.now()}`)
        }, n * 500)
      }}
    />
  )
}
