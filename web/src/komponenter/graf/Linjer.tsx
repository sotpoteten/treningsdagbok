import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useBredde, Verktoytips } from './felles'

export interface Linjeserie {
  id: string
  navn: string
  /** Verdi per x-indeks. Kortere serier slutter tidligere (f.eks. inneværende sesong). */
  verdier: number[]
  vekt: 'valgt' | 'forrige' | 'bakgrunn'
}

interface Props {
  serier: Linjeserie[]
  lengde: number
  hoyde?: number
  xMerker: { indeks: number; etikett: string }[]
  /** Loddrett strek, f.eks. «i dag». */
  merke?: { indeks: number; etikett: string }
  yFormat: (v: number) => string
  tips: (indeks: number) => ReactNode
  beskrivelse: string
}

const MARG = { topp: 16, hoyre: 64, bunn: 24, venstre: 44 }

function etiketter(serier: Linjeserie[], x: (i: number) => number, y: (v: number) => number) {
  const ende = (s: Linjeserie) => ({ x: x(s.verdier.length - 1), y: y(s.verdier[s.verdier.length - 1]) })
  const valgt = serier.find((s) => s.vekt === 'valgt' && s.verdier.length)
  const forrige = serier.find((s) => s.vekt === 'forrige' && s.verdier.length)
  if (!valgt) return forrige ? [{ s: forrige, over: false }] : []
  if (!forrige) return [{ s: valgt, over: false }]
  const a = ende(valgt)
  const b = ende(forrige)
  // Krysser den andre linja endepunktet til den valgte, settes navnet over punktet i stedet for til høyre.
  const yForrigeVedValgt = y(forrige.verdier[Math.min(valgt.verdier.length - 1, forrige.verdier.length - 1)])
  const over = Math.abs(a.y - yForrigeVedValgt) < 14
  const ay = over ? a.y - 12 : a.y
  // Forrige får navn bare hvis det ikke havner oppå navnet til den valgte.
  const kollisjon = Math.abs(ay - b.y) < 14 && Math.abs(a.x - b.x) < 70
  return kollisjon ? [{ s: valgt, over }] : [{ s: valgt, over }, { s: forrige, over: false }]
}

/** Linjer med felles x-akse og trådkors som viser alle seriene på samme indeks. */
export function Linjer({ serier, lengde, hoyde = 340, xMerker, merke, yFormat, tips, beskrivelse }: Props) {
  const [ref, bredde] = useBredde<HTMLDivElement>()
  const [indeks, setIndeks] = useState<number | null>(null)
  const [fokus, setFokus] = useState<string | null>(null)

  const indre = Math.max(0, bredde - MARG.venstre - MARG.hoyre)
  const hoydeIndre = hoyde - MARG.topp - MARG.bunn
  const maks = Math.max(1, ...serier.flatMap((s) => s.verdier))
  const x = scaleLinear().domain([0, lengde - 1]).range([0, indre])
  const y = scaleLinear().domain([0, maks]).nice(5).range([hoydeIndre, 0])
  const sti = line<number>()
    .x((_, i) => x(i))
    .y((v) => y(v))

  // Bakgrunn tegnes først, valgt sist, så den ligger øverst.
  const rekkefolge = { bakgrunn: 0, forrige: 1, valgt: 2 }
  const sortert = [...serier].sort((a, b) => rekkefolge[a.vekt] - rekkefolge[b.vekt] || (a.id === fokus ? 1 : -1))

  function tast(e: KeyboardEvent<SVGSVGElement>) {
    const na = indeks ?? merke?.indeks ?? 0
    const steg = e.shiftKey ? 30 : 7 // en uke, eller en måned med Shift
    let ny: number | null = null
    if (e.key === 'ArrowRight') ny = Math.min(lengde - 1, na + steg)
    else if (e.key === 'ArrowLeft') ny = Math.max(0, na - steg)
    else if (e.key === 'Home') ny = 0
    else if (e.key === 'End') ny = lengde - 1
    else if (e.key === 'Escape') return setIndeks(null)
    if (ny != null) {
      e.preventDefault()
      setIndeks(ny)
    }
  }

  function flytt(e: PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(x.invert(e.clientX - r.left))
    setIndeks(Math.max(0, Math.min(lengde - 1, i)))
  }

  return (
    <div className="graf" ref={ref} onMouseLeave={() => setIndeks(null)}>
      {bredde > 0 && (
        <svg
          width={bredde}
          height={hoyde}
          role="img"
          aria-label={`${beskrivelse}. Bruk piltastene for å flytte trådkorset en uke (Shift: en måned).`}
          tabIndex={0}
          onKeyDown={tast}
          onFocus={() => setIndeks((i) => i ?? merke?.indeks ?? lengde - 1)}
          onBlur={() => setIndeks(null)}
        >
          <g transform={`translate(${MARG.venstre},${MARG.topp})`}>
            {y.ticks(5).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line className={t === 0 ? 'akse-grunnlinje' : 'akse-rute'} x1={0} x2={indre} />
                <text className="akse-tekst" x={-8} dy="0.32em" textAnchor="end">
                  {yFormat(t)}
                </text>
              </g>
            ))}
            {xMerker.map((m) => (
              <g key={m.indeks} transform={`translate(${x(m.indeks)},0)`}>
                <line className="akse-rute" y1={0} y2={hoydeIndre} />
                <text className="akse-tekst" x={4} y={hoydeIndre + 16}>
                  {m.etikett}
                </text>
              </g>
            ))}
            {merke && (
              <g transform={`translate(${x(merke.indeks)},0)`}>
                <line className="graf-merke" y1={0} y2={hoydeIndre} />
                <text className="akse-tekst merke-tekst" x={4} y={10}>
                  {merke.etikett}
                </text>
              </g>
            )}

            {sortert.map((s) => (
              <path
                key={s.id}
                className={`graf-serie vekt-${s.vekt}${fokus === s.id ? ' fokus' : ''}${fokus && fokus !== s.id ? ' dempet' : ''}`}
                d={sti(s.verdier) ?? undefined}
              />
            ))}

            {/* Navn ved enden av de fremhevede linjene. Står de for tett, får bare den valgte navn
                (tegnforklaringen dekker resten); etiketter flyttes aldri bort fra linja si. */}
            {etiketter(serier, x, y).map(({ s, over }) => (
              <text
                key={s.id}
                className="linje-etikett"
                x={x(s.verdier.length - 1) + (over ? 0 : 6)}
                y={y(s.verdier[s.verdier.length - 1]) - (over ? 12 : 0)}
                dy="0.32em"
                textAnchor={over ? 'end' : 'start'}
              >
                {s.navn}
              </text>
            ))}

            {indeks != null && (
              <g>
                <line className="graf-traadkors" x1={x(indeks)} x2={x(indeks)} y1={0} y2={hoydeIndre} />
                {serier
                  .filter((s) => indeks < s.verdier.length)
                  .map((s) => (
                    <circle key={s.id} className={`graf-punkt vekt-${s.vekt}`} cx={x(indeks)} cy={y(s.verdier[indeks])} r={4} />
                  ))}
              </g>
            )}

            <rect className="treffflate" x={0} y={0} width={indre} height={hoydeIndre} onPointerMove={flytt} onPointerDown={flytt} />
          </g>
        </svg>
      )}
      <ul className="graf-tegnforklaring">
        {[...serier].reverse().map((s) => (
          <li key={s.id} onMouseEnter={() => setFokus(s.id)} onMouseLeave={() => setFokus(null)}>
            <i className={`linjenokkel vekt-${s.vekt}`} />
            {s.navn}
          </li>
        ))}
      </ul>
      {indeks != null && (
        <Verktoytips bredde={bredde} tips={{ x: MARG.venstre + x(indeks), y: MARG.topp, innhold: tips(indeks) }} />
      )}
    </div>
  )
}
