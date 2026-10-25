import { scaleBand, scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Cross, Thermometer, Trophy } from 'lucide-react'
import { useBredde } from './useBredde'
import { Verktoytips, type Seriedef } from './felles'

export interface Stolpepunkt {
  nokkel: string
  /** Verdi per serie-id. */
  verdier: Record<string, number>
  /** Markører over stolpen: et ikon for konkurranse, syk eller skadet, med antall dager
   *  ved siden av når det er flere. Uten ikon blir det et lite kvadrat i CSS-klassens farge. */
  markorer?: { klasse: string; navn: string; ikon?: Markorikon; antall?: number }[]
}

interface Props {
  punkter: Stolpepunkt[]
  serier: Seriedef[]
  hoyde?: number
  /** Linje over stolpene, f.eks. glidende snitt. Samme enhet som stolpene. */
  linje?: { verdier: number[]; navn: string }
  yFormat: (v: number) => string
  /** Etikett under x-aksen for et punkt, eller null for å hoppe over. */
  xEtikett: (p: Stolpepunkt, i: number) => string | null
  tips: (p: Stolpepunkt, i: number) => ReactNode
  onKlikk?: (p: Stolpepunkt) => void
  beskrivelse: string
}

/** Seriene som tegnes skravert med 1 px kant (se analyse.css). */
const SKRAVERTE = new Set(['seg-styrke', 'fyll-skadet'])

export type Markorikon = 'pokal' | 'syk' | 'skadet'
const IKONER = { pokal: Trophy, syk: Thermometer, skadet: Cross }

const MARG = { topp: 18, hoyre: 8, bunn: 24, venstre: 40 }

/** X-etiketter med minst 30 px mellomrom; de som ville kollidert, hoppes over. */
function xEtiketter(punkter: Stolpepunkt[], etikett: Props['xEtikett'], xPos: (i: number) => number) {
  const ut: { p: Stolpepunkt; i: number; e: string }[] = []
  let forrige = -Infinity
  punkter.forEach((p, i) => {
    const e = etikett(p, i)
    if (!e) return
    const x = xPos(i)
    if (x - forrige < 30) return
    ut.push({ p, i, e })
    forrige = x
  })
  return ut
}

/** Skravur (135°, 2 px strek, 2 px luft) for styrke og skadet, som i resten av designet. */
export function Skravur() {
  return (
    <defs>
      {[
        ['skravur-styrke', 'var(--styrke)'],
        ['skravur-skadet', 'var(--stempel)'],
      ].map(([id, farge]) => (
        <pattern key={id} id={id} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
          <rect width={2} height={4} style={{ fill: farge }} />
        </pattern>
      ))}
    </defs>
  )
}

/** Stablede stolper med 2 px mellomrom mellom segmentene. Rette hjørner (Kartbladet). */
export function Stolper({ punkter, serier, hoyde = 260, linje: snitt, yFormat, xEtikett, tips, onKlikk, beskrivelse }: Props) {
  const [ref, bredde] = useBredde<HTMLDivElement>()
  const [aktiv, setAktiv] = useState<number | null>(null)
  // Siste peker var berøring: første trykk viser verktøytipset, andre trykk åpner.
  const beroring = useRef(false)

  function tast(e: KeyboardEvent<SVGSVGElement>) {
    const n = punkter.length
    if (!n) return
    const na = aktiv ?? n - 1
    let ny: number | null = null
    if (e.key === 'ArrowRight') ny = Math.min(n - 1, na + 1)
    else if (e.key === 'ArrowLeft') ny = Math.max(0, na - 1)
    else if (e.key === 'Home') ny = 0
    else if (e.key === 'End') ny = n - 1
    else if (e.key === 'Escape') return setAktiv(null)
    else if (e.key === 'Enter' && aktiv != null && onKlikk) return onKlikk(punkter[aktiv])
    if (ny != null) {
      e.preventDefault()
      setAktiv(ny)
    }
  }

  function klikk(i: number) {
    if (beroring.current && aktiv !== i) return setAktiv(i)
    onKlikk?.(punkter[i])
  }

  const indre = Math.max(0, bredde - MARG.venstre - MARG.hoyre)
  const hoydeIndre = hoyde - MARG.topp - MARG.bunn
  const totaler = punkter.map((p) => serier.reduce((a, s) => a + (p.verdier[s.id] ?? 0), 0))
  const maks = Math.max(1, ...totaler, ...(snitt?.verdier ?? []))

  const x = scaleBand<number>()
    .domain(punkter.map((_, i) => i))
    .range([0, indre])
    .paddingInner(punkter.length > 80 ? 0.15 : 0.25)
  const y = scaleLinear().domain([0, maks]).nice(4).range([hoydeIndre, 0])
  const tykk = Math.min(24, x.bandwidth())
  const gap = tykk >= 6 ? 2 : 1

  const linjesti = snitt
    ? line<number>()
        .x((_, i) => (x(i) ?? 0) + x.bandwidth() / 2)
        .y((v) => y(v))(snitt.verdier)
    : null

  const aktivtPunkt = aktiv != null ? punkter[aktiv] : null

  return (
    <div className="graf" ref={ref} onMouseLeave={() => setAktiv(null)}>
      {bredde > 0 && (
        <svg
          width={bredde}
          height={hoyde}
          role="img"
          aria-label={`${beskrivelse}. Bruk piltastene for å gå mellom stolpene${onKlikk ? ' og Enter for å åpne' : ''}.`}
          tabIndex={0}
          onKeyDown={tast}
          onFocus={() => setAktiv((a) => a ?? punkter.length - 1)}
          onBlur={() => setAktiv(null)}
          onPointerDown={(e) => (beroring.current = e.pointerType === 'touch')}
        >
          <Skravur />
          <g transform={`translate(${MARG.venstre},${MARG.topp})`}>
            {y.ticks(4).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line className={t === 0 ? 'akse-grunnlinje' : 'akse-rute'} x1={0} x2={indre} />
                <text className="akse-tekst" x={-8} dy="0.32em" textAnchor="end">
                  {yFormat(t)}
                </text>
              </g>
            ))}

            {punkter.map((p, i) => {
              const x0 = (x(i) ?? 0) + (x.bandwidth() - tykk) / 2
              let topp = hoydeIndre
              const segmenter = serier.map((s) => {
                const v = p.verdier[s.id] ?? 0
                if (v <= 0) return null
                const h = hoydeIndre - y(v)
                // Mellomrommet ligger under hvert segment unntatt det nederste.
                const synlig = Math.max(1, topp === hoydeIndre ? h : h - gap)
                topp -= h
                // Skraverte segmenter har 1 px kant. SVG tegner kanten midt på rektangelets
                // ytterkant, så rektangelet trekkes inn 0,5 px for at kanten skal ligge innenfor
                // og segmentet bli like bredt som resten av stolpen.
                const inn = SKRAVERTE.has(s.klasse) ? 0.5 : 0
                return (
                  <rect key={s.id} className={s.klasse} x={x0 + inn} y={topp + inn} width={tykk - 2 * inn} height={Math.max(0.5, synlig - 2 * inn)} />
                )
              })
              return (
                <g key={p.nokkel} className={aktiv === i ? 'stolpe aktiv' : 'stolpe'}>
                  {segmenter}
                  {aktiv === i && totaler[i] > 0 && (
                    <rect className="stolpe-ramme" x={x0 - 1.5} y={topp - 1.5} width={tykk + 3} height={hoydeIndre - topp + 1.5} />
                  )}
                  {(() => {
                    // Markørene stables oppover fra stolpetoppen: ikonene tar 15 px, kvadratene 8 px.
                    let y0 = topp - 3
                    return p.markorer?.map((m) => {
                      if (m.ikon) {
                        y0 -= 15
                        const xm = x0 + tykk / 2
                        const Ikon = IKONER[m.ikon]
                        return (
                          <g key={m.klasse} className={`markor-ikon ${m.klasse}`}>
                            <Ikon x={xm - 7} y={y0} width={14} height={14} strokeWidth={2.25} aria-hidden />
                            {(m.antall ?? 1) > 1 && (
                              <text className="markor-antall" x={xm + 8} y={y0 + 11}>
                                {m.antall}
                              </text>
                            )}
                          </g>
                        )
                      }
                      y0 -= 8
                      return <rect key={m.klasse} className={`markor-prikk ${m.klasse}`} x={x0 + tykk / 2 - 3} y={y0 + 2} width={6} height={6} />
                    })
                  })()}
                </g>
              )
            })}

            {linjesti && <path className="graf-linje" d={linjesti} />}

            {xEtiketter(punkter, xEtikett, (i) => (x(i) ?? 0) + x.bandwidth() / 2).map(({ p, i, e }) => {
              return (
                <text key={p.nokkel} className="akse-tekst" x={(x(i) ?? 0) + x.bandwidth() / 2} y={hoydeIndre + 16} textAnchor="middle">
                  {e}
                </text>
              )
            })}

            {/* Treffflater: hele høyden per stolpe, større enn merket. */}
            {punkter.map((p, i) => (
              <rect
                key={p.nokkel}
                className="treffflate"
                x={(x(i) ?? 0) - (x.step() - x.bandwidth()) / 2}
                y={0}
                width={x.step()}
                height={hoydeIndre}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setAktiv(i)}
                onClick={() => (onKlikk || beroring.current ? klikk(i) : undefined)}
                style={onKlikk ? { cursor: 'pointer' } : undefined}
              />
            ))}
          </g>
        </svg>
      )}
      {aktivtPunkt && aktiv != null && (
        <Verktoytips
          bredde={bredde}
          tips={{
            x: MARG.venstre + (x(aktiv) ?? 0) + x.bandwidth() / 2,
            y: MARG.topp + Math.max(0, y(totaler[aktiv]) - 10),
            innhold: tips(aktivtPunkt, aktiv),
          }}
        />
      )}
    </div>
  )
}
