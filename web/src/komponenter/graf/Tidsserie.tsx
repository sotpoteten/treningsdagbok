import { bisector, extent } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useBredde, Verktoytips } from './felles'
import { Skravur } from './Stolper'

export interface Serie {
  id: string
  navn: string
  verdier: (number | null)[]
  /** CSS-klasse for strek/punkt, f.eks. «ts-hoved» eller «ts-snitt». */
  klasse: string
  form: 'linje' | 'punkt'
}

interface Props {
  /** X-verdier i stigende rekkefølge (sekunder, eller dager som tall). */
  x: number[]
  serier: Serie[]
  /** Flatt bånd, f.eks. normalområdet for HRV. */
  band?: { lav: (number | null)[]; hoy: (number | null)[]; navn: string }
  /** Loddrette merker (f.eks. sykdom) ved bestemte indekser. */
  markorer?: { indeks: number; klasse: string }[]
  hoyde?: number
  xMerker: (domene: [number, number]) => { x: number; etikett: string }[]
  yFormat: (v: number) => string
  /** Lavere er bedre (f.eks. tempo): snur y-aksen. */
  snuY?: boolean
  yDomene?: [number, number]
  tips: (i: number) => ReactNode
  /** Kontrollert aktiv indeks, så grafen kan synkroniseres med kartet. */
  aktiv?: number | null
  onAktiv?: (i: number | null) => void
  beskrivelse: string
}

const MARG = { topp: 12, hoyre: 12, bunn: 22, venstre: 40 }
const finnX = bisector<number, number>((d) => d).center

/** Tidsserie med felles x-akse, trådkors, tastatur og berøring. Aldri to y-akser. */
export function Tidsserie(p: Props) {
  const { x: xs, serier, band, markorer, hoyde = 180, xMerker, yFormat, snuY, tips, beskrivelse } = p
  const [ref, bredde] = useBredde<HTMLDivElement>()
  const [egenAktiv, setEgenAktiv] = useState<number | null>(null)
  const aktiv = p.aktiv !== undefined ? p.aktiv : egenAktiv
  const settAktiv = (i: number | null) => (p.onAktiv ? p.onAktiv(i) : setEgenAktiv(i))
  const svgRef = useRef<SVGSVGElement>(null)
  const klipp = `klipp-${useId().replace(/:/g, '')}`

  const indre = Math.max(0, bredde - MARG.venstre - MARG.hoyre)
  const hoydeIndre = hoyde - MARG.topp - MARG.bunn
  const alle = serier.flatMap((s) => s.verdier).concat(band ? [...band.lav, ...band.hoy] : [])
  const [ymin, ymaks] = p.yDomene ?? (extent(alle.filter((v): v is number => v != null)) as [number, number])
  const xd = (extent(xs) as [number, number]) ?? [0, 1]
  const x = scaleLinear().domain(xd).range([0, indre])
  const y = scaleLinear()
    .domain([ymin ?? 0, ymaks ?? 1])
    .nice(4)
    .range(snuY ? [0, hoydeIndre] : [hoydeIndre, 0])

  const sti = (v: (number | null)[]) =>
    line<number | null>()
      .defined((d) => d != null)
      .x((_, i) => x(xs[i]))
      .y((d) => y(d as number))(v) ?? undefined

  const bandSti = band
    ? area<number>()
        .defined((i) => band.lav[i] != null && band.hoy[i] != null)
        .x((i) => x(xs[i]))
        .y0((i) => y(band.lav[i] as number))
        .y1((i) => y(band.hoy[i] as number))(xs.map((_, i) => i)) ?? undefined
    : undefined

  function flytt(e: PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    settAktiv(finnX(xs, x.invert(e.clientX - r.left)))
  }

  function tast(e: KeyboardEvent<SVGSVGElement>) {
    const n = xs.length
    if (!n) return
    const na = aktiv ?? n - 1
    const steg = e.shiftKey ? 10 : 1
    let ny: number | null = null
    if (e.key === 'ArrowRight') ny = Math.min(n - 1, na + steg)
    else if (e.key === 'ArrowLeft') ny = Math.max(0, na - steg)
    else if (e.key === 'Home') ny = 0
    else if (e.key === 'End') ny = n - 1
    else if (e.key === 'Escape') return settAktiv(null)
    if (ny != null) {
      e.preventDefault()
      settAktiv(ny)
    }
  }

  const ax = aktiv != null ? x(xs[aktiv]) : null

  return (
    <div className="graf tidsserie" ref={ref} onPointerLeave={(e) => e.pointerType === 'mouse' && settAktiv(null)}>
      {bredde > 0 && xs.length > 0 && (
        <svg
          ref={svgRef}
          width={bredde}
          height={hoyde}
          role="img"
          aria-label={`${beskrivelse}. Bruk piltastene for å flytte trådkorset (Shift: ti steg).`}
          tabIndex={0}
          onKeyDown={tast}
          onFocus={() => aktiv == null && settAktiv(xs.length - 1)}
          onBlur={() => settAktiv(null)}
        >
          <Skravur />
          <defs>
            <clipPath id={klipp}>
              <rect x={0} y={-2} width={indre} height={hoydeIndre + 4} />
            </clipPath>
          </defs>
          <g transform={`translate(${MARG.venstre},${MARG.topp})`}>
            {y.ticks(4).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line className="akse-rute" x1={0} x2={indre} />
                <text className="akse-tekst" x={-8} dy="0.32em" textAnchor="end">
                  {yFormat(t)}
                </text>
              </g>
            ))}
            <line className="akse-grunnlinje" x1={0} x2={indre} y1={hoydeIndre} y2={hoydeIndre} />
            {xMerker(xd).map((m) => (
              <text key={m.x} className="akse-tekst" x={x(m.x)} y={hoydeIndre + 16} textAnchor="middle">
                {m.etikett}
              </text>
            ))}

            <g clipPath={`url(#${klipp})`}>
            {bandSti && <path className="ts-band" d={bandSti} />}
            {markorer?.map((m) => (
              <rect key={m.indeks} className={`ts-markor ${m.klasse}`} x={x(xs[m.indeks]) - 1} y={0} width={2} height={hoydeIndre} />
            ))}

            {serier.map((s) =>
              s.form === 'linje' ? (
                <path key={s.id} className={`ts-linje ${s.klasse}`} d={sti(s.verdier)} />
              ) : (
                <g key={s.id} className={`ts-punkter ${s.klasse}`}>
                  {s.verdier.map((v, i) => (v == null ? null : <circle key={i} cx={x(xs[i])} cy={y(v)} r={1.6} />))}
                </g>
              ),
            )}
            </g>

            {ax != null && aktiv != null && (
              <g>
                <line className="graf-traadkors" x1={ax} x2={ax} y1={0} y2={hoydeIndre} />
                {serier.map((s) =>
                  s.verdier[aktiv] == null ? null : (
                    <circle key={s.id} className={`graf-punkt ts-aktiv ${s.klasse}`} cx={ax} cy={y(s.verdier[aktiv] as number)} r={4} />
                  ),
                )}
              </g>
            )}

            <rect className="treffflate" x={0} y={0} width={indre} height={hoydeIndre} onPointerMove={flytt} onPointerDown={flytt} />
          </g>
        </svg>
      )}
      {aktiv != null && ax != null && <Verktoytips bredde={bredde} tips={{ x: MARG.venstre + ax, y: MARG.topp, innhold: tips(aktiv) }} />}
    </div>
  )
}
