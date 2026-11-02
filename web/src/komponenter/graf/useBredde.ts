import { useLayoutEffect, useState } from 'react'

/**
 * Bredden til et element, oppdatert ved endring. Refen er en tilbakekalling, så målingen
 * kobles på hver gang elementet kommer til, også når grafen først har vist en tom tekst.
 */
export function useBredde<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [bredde, setBredde] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    // ResizeObserver melder størrelsen straks elementet observeres, så første måling kommer herfra.
    const ro = new ResizeObserver(([e]) => setBredde(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, bredde] as const
}
