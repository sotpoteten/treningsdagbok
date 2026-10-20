import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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

export interface Seriedef {
  id: string
  navn: string
  /** CSS-klasse som gir fyll, f.eks. «seg-i1» eller «fyll-volum». */
  klasse: string
  /** Ikon i stedet for fargefeltet, f.eks. pokalen for konkurranser. */
  ikon?: ReactNode
}

export function Tegnforklaring({ serier }: { serier: Seriedef[] }) {
  if (serier.length < 2) return null
  return (
    <ul className="graf-tegnforklaring">
      {serier.map((s) => (
        <li key={s.id}>
          {s.ikon ? <span className={`nokkel-ikon ${s.klasse}`}>{s.ikon}</span> : <i className={s.klasse} />}
          {s.navn}
        </li>
      ))}
    </ul>
  )
}

interface Tips {
  x: number
  y: number
  innhold: ReactNode
}

/** Verktøytips som holder seg innenfor grafen. */
export function Verktoytips({ tips, bredde }: { tips: Tips | null; bredde: number }) {
  if (!tips) return null
  const venstre = tips.x > bredde * 0.6
  return (
    <div
      className="graf-tips"
      role="status"
      style={{
        top: tips.y,
        left: venstre ? undefined : tips.x + 14,
        right: venstre ? bredde - tips.x + 14 : undefined,
      }}
    >
      {tips.innhold}
    </div>
  )
}

/** Ramme rundt en graf med tittel, valg og bytte mellom graf og tabell. */
export function Grafkort({
  tittel,
  forklaring,
  valg,
  tabell,
  children,
}: {
  tittel: string
  forklaring?: ReactNode
  valg?: ReactNode
  tabell: () => ReactNode
  children: ReactNode
}) {
  const [visTabell, setVisTabell] = useState(false)
  return (
    <section className="grafkort">
      <header className="grafkort-hode">
        <div>
          <h2>{tittel}</h2>
          {forklaring && <p className="grafkort-forklaring">{forklaring}</p>}
        </div>
        <div className="grafkort-valg">
          {valg}
          <div className="segment" role="group" aria-label="Visning">
            <button type="button" aria-pressed={!visTabell} onClick={() => setVisTabell(false)}>
              Graf
            </button>
            <button type="button" aria-pressed={visTabell} onClick={() => setVisTabell(true)}>
              Tabell
            </button>
          </div>
        </div>
      </header>
      {visTabell ? <div className="grafkort-tabell">{tabell()}</div> : children}
    </section>
  )
}

/** Segmentert knapperad for små valg (uke/måned, timer/km …). */
export function Segment<T extends string>({
  verdi,
  valg,
  onEndre,
  etikett,
}: {
  verdi: T
  valg: { id: T; navn: string }[]
  onEndre: (v: T) => void
  etikett: string
}) {
  return (
    <div className="segment" role="group" aria-label={etikett}>
      {valg.map((v) => (
        <button key={v.id} type="button" aria-pressed={v.id === verdi} onClick={() => onEndre(v.id)}>
          {v.navn}
        </button>
      ))}
    </div>
  )
}
