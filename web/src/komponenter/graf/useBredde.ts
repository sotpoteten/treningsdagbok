import { useLayoutEffect, useRef, useState } from 'react'

/** Bredden til et element, oppdatert ved endring. */
export function useBredde<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [bredde, setBredde] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBredde(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setBredde(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, bredde] as const
}
