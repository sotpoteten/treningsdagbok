import { useEffect, useMemo, useRef } from 'react'
import { NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router'
import type { Dagbok } from '../data/last'
import { sesongDag, sesonger, sesongFraUrl, sesongTilUrl, type Sesong } from '../data/statistikk'
import { isoDato } from '../data/uker'
import { Topplinje } from '../komponenter/Topplinje'
import { Intensitet } from './analyse/Intensitet'
import { Oversikt } from './analyse/Oversikt'
import { Rekorder } from './analyse/Rekorder'
import { Sesonger } from './analyse/Sesonger'
import { Volum } from './analyse/Volum'

export interface Analysekontekst {
  dagbok: Dagbok
  sesonger: Sesong[] // eldste først
  valgt: Sesong
  forrige: Sesong | null
  /** Dag i sesongen som sammenlignes «på samme dato»: i dag for inneværende sesong, ellers siste dag. */
  sammenligningsdag: number
  /** Siste dag i valgt sesong som har passert (i dag eller sesongslutt). */
  sluttdato: string
}

const UNDERSIDER = [
  { sti: '/analyse', navn: 'Oversikt', end: true },
  { sti: '/analyse/volum', navn: 'Volum' },
  { sti: '/analyse/sesonger', navn: 'Sesonger' },
  { sti: '/analyse/intensitet', navn: 'Intensitet og aktivitet' },
  { sti: '/analyse/rekorder', navn: 'Rekorder og helse' },
]

export function Analyse({ dagbok }: { dagbok: Dagbok }) {
  const [params, setParams] = useSearchParams()
  const { search } = useLocation()
  const alle = useMemo(() => sesonger(dagbok), [dagbok])
  const idag = isoDato(new Date())

  const kontekst = useMemo<Analysekontekst>(() => {
    const onsket = params.get('sesong')
    const i = onsket ? alle.findIndex((s) => s.navn === sesongFraUrl(onsket)) : -1
    const indeks = i >= 0 ? i : alle.length - 1
    const valgt = alle[indeks]
    const pagaende = idag >= valgt.fra && idag <= valgt.til
    return {
      dagbok,
      sesonger: alle,
      valgt,
      forrige: indeks > 0 ? alle[indeks - 1] : null,
      sammenligningsdag: pagaende ? sesongDag(idag) : valgt.dager - 1,
      sluttdato: pagaende ? idag : valgt.til,
    }
  }, [alle, params, dagbok, idag])

  // På smale skjermer kan aktiv fane ligge utenfor undermenyen; rull den inn.
  const { pathname } = useLocation()
  const meny = useRef<HTMLElement>(null)
  // Myke kanter på den side av undermenyen som har mer innhold å rulle til.
  const oppdaterKanter = () => {
    const m = meny.current
    if (!m) return
    m.classList.toggle('mer-venstre', m.scrollLeft > 2)
    m.classList.toggle('mer-hoyre', m.scrollLeft + m.clientWidth < m.scrollWidth - 2)
  }
  useEffect(() => {
    document.querySelector('.undermeny a.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    oppdaterKanter()
  }, [pathname])

  function velgSesong(navn: string) {
    const p = new URLSearchParams(params)
    p.set('sesong', sesongTilUrl(navn))
    setParams(p, { replace: true })
  }

  return (
    <>
      <Topplinje />
      <main className="analyse">
        <div className="analyse-hode">
          <nav className="undermeny" aria-label="Analyse" ref={meny} onScroll={oppdaterKanter}>
            {UNDERSIDER.map((u) => (
              <NavLink key={u.sti} to={{ pathname: u.sti, search }} end={u.end}>
                {u.navn}
              </NavLink>
            ))}
          </nav>
          <label className="sesongvelger">
            <span>Sesong</span>
            <select value={kontekst.valgt.navn} onChange={(e) => velgSesong(e.target.value)}>
              {[...alle].reverse().map((s) => (
                <option key={s.navn} value={s.navn}>
                  {s.navn}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Routes>
          <Route index element={<Oversikt k={kontekst} />} />
          <Route path="volum" element={<Volum k={kontekst} />} />
          <Route path="sesonger" element={<Sesonger k={kontekst} />} />
          <Route path="intensitet" element={<Intensitet k={kontekst} />} />
          <Route path="rekorder" element={<Rekorder k={kontekst} />} />
        </Routes>
      </main>
    </>
  )
}
