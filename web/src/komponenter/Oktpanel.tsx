import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { tempo as fart } from '../data/aggregat'
import { dato, km, tempo, varighetLang } from '../data/format'
import type { Dagbok } from '../data/last'
import { SONER, type Okt } from '../data/typer'
import { Dagsmarkorer, Stempler } from './Dagsmarkorer'
import { Sonestolpe } from './Sonestolpe'

interface Props {
  okt: Okt
  dagbok: Dagbok
  onLukk: () => void
  onGaTil: (okt: Okt) => void
}

export function Oktpanel({ okt, dagbok, onLukk, onGaTil }: Props) {
  const ref = useRef<HTMLElement>(null)
  const i = dagbok.okter.indexOf(okt)
  const forrige = i > 0 ? dagbok.okter[i - 1] : null
  const neste = i < dagbok.okter.length - 1 ? dagbok.okter[i + 1] : null
  const rapport = dagbok.dagerPerDato.get(okt.dato) ?? null

  useEffect(() => {
    function tast(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') onLukk()
      else if (e.key === 'ArrowLeft' && forrige) onGaTil(forrige)
      else if (e.key === 'ArrowRight' && neste) onGaTil(neste)
    }
    window.addEventListener('keydown', tast)
    return () => window.removeEventListener('keydown', tast)
  }, [forrige, neste, onLukk, onGaTil])

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
    ref.current?.focus({ preventScroll: true })
  }, [okt.id])

  const loping = okt.blokker.filter((b) => b.aktivitet_id <= 3 && b.distanse_km)
  const lopMin = loping.reduce((a, b) => a + b.minutter, 0)
  const lopKm = loping.reduce((a, b) => a + (b.distanse_km ?? 0), 0)
  const snitt = fart(lopMin, lopKm)
  const soneSum = SONER.reduce((a, s) => a + (okt.sone_min[s] ?? 0), 0)
  const puls = dagbok.profil.pulssoner

  return (
    <aside className="oktpanel" ref={ref} tabIndex={-1} aria-labelledby="okt-tittel">
      <div className="panel-topp">
        <button type="button" className="ikonknapp" onClick={() => forrige && onGaTil(forrige)} disabled={!forrige} aria-label="Forrige økt (←)">
          <ChevronLeft />
        </button>
        <button type="button" className="ikonknapp" onClick={() => neste && onGaTil(neste)} disabled={!neste} aria-label="Neste økt (→)">
          <ChevronRight />
        </button>
        <span className="panel-pos">
          Økt {i + 1} av {dagbok.okter.length}
        </span>
        <button type="button" className="ikonknapp" onClick={onLukk} aria-label="Lukk (Esc)">
          <X />
        </button>
      </div>

      <h2 id="okt-tittel">{okt.navn}</h2>
      <p className="panel-meta">
        {stor(dato(okt.dato, 'EEEE d. MMMM yyyy'))}
        {okt.beskrivelse && <span className="panel-beskrivelse"> · {okt.beskrivelse}</span>}
      </p>
      {(rapport?.syk || rapport?.skadet || rapport?.konkurranse || rapport?.reise || rapport?.hoyde) && (
        <div className="panel-markorer">
          <Stempler rapport={rapport} />
          <Dagsmarkorer rapport={rapport} />
        </div>
      )}

      <dl className="nokkeltall">
        <div>
          <dt>Varighet</dt>
          <dd>{varighetLang(okt.varighet_min)}</dd>
        </div>
        <div>
          <dt>Distanse</dt>
          <dd>{okt.distanse_km > 0 ? `${km(okt.distanse_km)} km` : '–'}</dd>
        </div>
        <div>
          <dt>Snittfart</dt>
          <dd>{snitt ? `${tempo(snitt)} /km` : '–'}</dd>
        </div>
        <div>
          <dt>Høyeste sone</dt>
          <dd>{okt.hoyeste_sone ?? '–'}</dd>
        </div>
        <div>
          <dt>Opplevd belastning</dt>
          <dd>{okt.opplevd_belastning != null ? <Skala verdi={okt.opplevd_belastning} /> : '–'}</dd>
        </div>
        <div>
          <dt>Dagsform</dt>
          <dd>{okt.dagsform != null ? <Skala verdi={okt.dagsform} /> : '–'}</dd>
        </div>
      </dl>

      {okt.kommentar && (
        <section className="panel-del">
          <h3>Dagboknotat</h3>
          <p className="notat">{okt.kommentar}</p>
        </section>
      )}

      {soneSum > 0 && (
        <section className="panel-del">
          <h3>Soner</h3>
          <Sonestolpe sone={okt.sone_min} styrke={okt.styrke_min} />
          <table className="sonetabell">
            <tbody>
              {SONER.filter((s) => okt.sone_min[s]).map((s) => (
                <tr key={s}>
                  <th scope="row">
                    <i className={`prikk seg-${s.toLowerCase()}`} />
                    {s}
                  </th>
                  <td className="puls">
                    {puls[s].Min}–{puls[s].Max}
                  </td>
                  <td>{varighetLang(okt.sone_min[s]!)}</td>
                  <td>{Math.round(((okt.sone_min[s] ?? 0) / soneSum) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fotnote">Puls i slag/min etter dagens soner (oppdatert {dato(puls.sist_oppdatert, 'd. MMM yyyy')}).</p>
        </section>
      )}

      <section className="panel-del">
        <h3>Blokker</h3>
        <table className="blokktabell">
          <thead>
            <tr>
              <th scope="col">Aktivitet</th>
              <th scope="col">Tid</th>
              <th scope="col">Km</th>
              <th scope="col">Fart</th>
            </tr>
          </thead>
          <tbody>
            {okt.blokker.map((b) => {
              const f = b.aktivitet_id <= 3 ? fart(b.minutter, b.distanse_km) : null
              const soner = SONER.filter((s) => b.soner[s]).map((s) => `${s} ${b.soner[s]}′`)
              return (
                <tr key={b.posisjon} className={b.kategori === 'o-teknikk' ? 'delsett' : undefined}>
                  <td>
                    {b.aktivitet}
                    {soner.length > 0 && <span className="blokk-soner">{soner.join(' · ')}</span>}
                    {b.kategori === 'o-teknikk' && <span className="blokk-soner">Inngår i løpetiden</span>}
                  </td>
                  <td>{b.minutter}′</td>
                  <td>{b.distanse_km ? km(b.distanse_km) : ''}</td>
                  <td>{f ? tempo(f) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {okt.kommentarer_andre.length > 0 && (
        <section className="panel-del andre">
          <h3>Kommentar fra trener/andre</h3>
          {okt.kommentarer_andre.map((k, n) => (
            <p key={n}>{k}</p>
          ))}
        </section>
      )}

      {rapport && (rapport.notat || rapport.sykdom || rapport.skade) && (
        <section className="panel-del">
          <h3>Dagen</h3>
          {rapport.notat && <p className="notat">{rapport.notat}</p>}
          {rapport.sykdom && (
            <p>
              <b>Sykdom:</b> {rapport.sykdom.symptomer.join(', ')}
              {rapport.sykdom.kommentar && <> – {rapport.sykdom.kommentar}</>}
            </p>
          )}
          {rapport.skade?.map((s, n) => (
            <p key={n}>
              <b>Skade:</b> {[s.type, s.kroppsdel].filter(Boolean).join(', ')}
              {s.kommentar && <> – {s.kommentar}</>}
            </p>
          ))}
        </section>
      )}
    </aside>
  )
}

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Skala({ verdi }: { verdi: number }) {
  return (
    <span className="skala" aria-label={`${verdi} av 10`}>
      {verdi}
      <span className="skala-strek" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < verdi ? 'fylt' : undefined} />
        ))}
      </span>
    </span>
  )
}
