import type { CSSProperties } from "react"
import { Toaster as Sonner } from "sonner"

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      offset={24}
      duration={2000}
      closeButton
      visibleToasts={3}
      style={{
        "--width": "100%",
        "--normal-bg": "hsl(var(--card))",
        "--normal-border": "hsl(var(--border))",
        "--normal-text": "hsl(var(--foreground))",
        "--success-bg": "hsl(var(--card))",
        "--success-border": "hsl(142 46% 42%)",
        "--success-text": "hsl(var(--foreground))",
        "--error-bg": "hsl(var(--card))",
        "--error-border": "hsl(var(--destructive))",
        "--error-text": "hsl(var(--foreground))",
        fontFamily: '"IBM Plex Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      } as CSSProperties}
      toastOptions={{
        classNames: {
          toast: "w-fit max-w-[min(22rem,calc(100vw-2rem))] rounded-md border bg-card text-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
          success: "border-[hsl(142_46%_42%)]",
          error: "border-destructive/60",
          closeButton: "border-border bg-card text-muted-foreground hover:text-foreground",
        },
      }}
    />
  )
}
