import { NotebookText } from 'lucide-react'
import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { summer } from '../data/aggregat'
import { dato, km, timer, UKEDAG, ukespenn } from '../data/format'
import type { Okt } from '../data/typer'
import type { Uke, Ukedag } from '../data/uker'
import { Dagsmarkorer, Stempler } from './Dagsmarkorer'
import { Oktkort } from './Oktkort'
import { Sonestolpe } from './Sonestolpe'

interface Props {
  uke: Uke
  treff: ((o: Okt) => boolean) | null
  valgtId: string | null
  idag: string
  /** Økter med GPS-spor fra Garmin. */
  medSpor: Set<string>
}

export const Ukerad = memo(function Ukerad({ uke, treff, valgtId, idag, medSpor }: Props) {
  const sum = summer(uke.okter)
  const tomme = tommeRekker(uke.dager)
  const harTreff = !treff || uke.okter.some(treff)
  return (
    <article className={harTreff ? 'uke' : 'uke uten-treff'} aria-labelledby={`uke-${uke.nokkel}`}>
      <span className="koordinat" aria-hidden>
        {uke.ar} · {String(uke.uke).padStart(2, '0')}
      </span>
      <header className="uke-hode">
        <h2 id={`uke-${uke.nokkel}`}>
          Uke {uke.uke}
          <span className="uke-spenn">{ukespenn(uke.mandag, uke.sondag)}</span>
        </h2>
        <div className="uke-tall">
          <span className="celle">
            <b>{timer(sum.minutter)}</b>
            <small>timer</small>
          </span>
          <span className="celle">
            <b>{km(sum.km)}</b>
            <small>km</small>
          </span>
          <span className="celle">
            <b>{sum.okter}</b>
            <small>økter</small>
          </span>
          <span className="celle stolpecelle">
            <Sonestolpe sone={sum.sone} styrke={sum.styrke} />
            {sum.otek > 0 && <small className="otek">O-teknikk {timer(sum.otek)}</small>}
          </span>
        </div>
      </header>
      <div className="uke-dager">
        {uke.dager.map((d, i) => (
          <Dagcelle key={d.dato} dag={d} ukedag={i} tom={tomme[i]} treff={treff} valgtId={valgtId} idag={idag} medSpor={medSpor} />
        ))}
      </div>
      {uke.kommentarer.length > 0 && <Ukekommentar kommentarer={uke.kommentarer.map((k) => k.tekst)} />}
    </article>
  )
})

/** En dag uten økter og uten noe registrert. */
function erTom(d: Ukedag): boolean {
  const r = d.rapport
  return !d.okter.length && !(r && (r.syk || r.skadet || r.reise || r.hoyde || r.fridag || r.konkurranse || r.notat))
}

/**
 * For hver dag: null hvis dagen har innhold, ellers om den starter en rekke tomme dager
 * (med etiketten for hele rekka) eller fortsetter en. På mobil vises bare starten.
 */
type Tom = null | { start: true; etikett: string } | { start: false }

function tommeRekker(dager: Ukedag[]): Tom[] {
  const ut: Tom[] = dager.map(() => null)
  for (let i = 0; i < dager.length; i++) {
    if (!erTom(dager[i])) continue
    let j = i
    while (j + 1 < dager.length && erTom(dager[j + 1])) j++
    const fra = `${UKEDAG[i]} ${dato(dager[i].dato, 'd.')}`
    ut[i] = { start: true, etikett: j > i ? `${fra}–${UKEDAG[j].toLowerCase()} ${dato(dager[j].dato, 'd.')}` : fra }
    for (let k = i + 1; k <= j; k++) ut[k] = { start: false }
    i = j
  }
  return ut
}

interface DagProps {
  dag: Ukedag
  ukedag: number
  tom: Tom
  treff: Props['treff']
  valgtId: string | null
  idag: string
  medSpor: Set<string>
}

function Dagcelle({ dag, ukedag, tom, treff, valgtId, idag, medSpor }: DagProps) {
  const r = dag.rapport
  const klasser = ['dag', r?.syk && 'syk', r?.skadet && 'skadet', dag.dato === idag && 'idag', tom && 'tom', tom && !tom.start && 'tom-fortsatt']
    .filter(Boolean)
    .join(' ')
  const sykdom = r?.sykdom ? r.sykdom.kommentar?.trim() || r.sykdom.symptomer.join(', ') : null
  const skade = r?.skade?.map((s) => [s.kroppsdel, s.type?.toLowerCase()].filter(Boolean).join(', ')).join('; ')
  return (
    <div className={klasser}>
      <div className="dag-hode">
        <span className="dag-dato">
          {UKEDAG[ukedag]} {dato(dag.dato, 'd.')}
          <span className="dag-mnd"> {dato(dag.dato, 'MMM')}</span>
        </span>
        {tom?.start && <span className="tom-spenn">{tom.etikett} · ingen økter</span>}
        <Dagsmarkorer rapport={r} />
      </div>
      <Stempler rapport={r} />
      {(sykdom || skade) && <Dagnotat klasse="dag-notat helse">{[sykdom, skade].filter(Boolean).join(' · ')}</Dagnotat>}
      {dag.okter.map((o) => (
        <Oktkort key={o.id} okt={o} dempet={!!treff && !treff(o)} valgt={o.id === valgtId} spor={medSpor.has(o.id)} />
      ))}
      {r?.notat && (
        <Dagnotat klasse="dag-notat">
          <NotebookText className="ikon" aria-label="Dagsnotat" />
          {r.notat}
        </Dagnotat>
      )}
    </div>
  )
}

/** Dagsnotatet er kuttet til fire linjer. Er det lengre, kan det foldes ut med et trykk på
 *  teksten eller på «Les mer», på alle dager, også de uten økter. */
function Dagnotat({ klasse, children }: { klasse: string; children: ReactNode }) {
  const [apen, setApen] = useState(false)
  const [ref, kuttet] = useKuttet<HTMLParagraphElement>(apen)
  return (
    <>
      <p
        ref={ref}
        className={apen ? `${klasse} apen` : kuttet ? `${klasse} kuttet` : klasse}
        onClick={kuttet || apen ? () => setApen(!apen) : undefined}
      >
        {children}
      </p>
      {(kuttet || apen) && (
        <button type="button" className="lenkeknapp dag-mer" onClick={() => setApen(!apen)} aria-expanded={apen}>
          {apen ? 'Vis mindre' : 'Les mer'}
        </button>
      )}
    </>
  )
}

/** Om teksten i elementet er kuttet. Avhenger av bredden, så den måles på nytt ved endring. */
function useKuttet<T extends HTMLElement>(apen: boolean) {
  const ref = useRef<T>(null)
  const [kuttet, setKuttet] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || apen) return
    const mal = () => setKuttet(el.scrollHeight > el.clientHeight + 1)
    mal()
    const ro = new ResizeObserver(mal)
    ro.observe(el)
    return () => ro.disconnect()
  }, [apen])
  return [ref, kuttet] as const
}

function Ukekommentar({ kommentarer }: { kommentarer: string[] }) {
  const [apen, setApen] = useState(false)
  // Knappen vises bare når teksten faktisk er kuttet.
  const [ref, kuttet] = useKuttet<HTMLDivElement>(apen)

  return (
    <div className={apen ? 'ukekommentar apen' : 'ukekommentar'}>
      <div className="ukekommentar-tekst" ref={ref}>
        {kommentarer.map((k, i) => (
          <p key={i}>{k}</p>
        ))}
      </div>
      {(kuttet || apen) && (
        <button type="button" className="lenkeknapp" onClick={() => setApen(!apen)} aria-expanded={apen}>
          {apen ? 'Vis mindre' : 'Les mer'}
        </button>
      )}
    </div>
  )
}
