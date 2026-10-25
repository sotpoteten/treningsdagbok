import { ExternalLink } from 'lucide-react'
import { useId, useState } from 'react'
import { disiplinTekst, indeks, klokke, plassTekst, prosent, TYPE_NAVN } from '../data/konkurranser'
import type { Konkurranse, Stafett } from '../data/typer'

/** Forklaring når strekktidene fra Eventor er ødelagte, men totaltiden gjelder. */
export const UGYLDIGE_STREKK = 'Strekktidene er ugyldige for dette løpet, så strekkfart og bomtid mangler. Tiden og plassen gjelder.'

/** Lenker til Eventor, Livelox og WinSplits, alltid i ny fane. Kart vises aldri her. */
export function Eksternlenker({ lenker }: { lenker: Konkurranse['lenker'] }) {
  const liste = [
    ['Eventor', lenker.eventor],
    ['Livelox', lenker.livelox],
    ['WinSplits', lenker.winsplits],
  ].filter((l): l is [string, string] => !!l[1])
  return (
    <span className="eksterne-lenker">
      {liste.map(([navn, url]) => (
        <a key={navn} href={url} target="_blank" rel="noopener noreferrer">
          {navn}
          <ExternalLink aria-hidden />
          <span className="skjult"> (åpnes i ny fane)</span>
        </a>
      ))}
    </span>
  )
}

/** «Resultat» i øktpanelet: plass, prosent bak, strekkfart, bomtid og strekktidene. */
export function Resultat({ lop, stafetter }: { lop: Konkurranse[]; stafetter: Stafett[] }) {
  return (
    <section className="panel-del resultat">
      <h3>Resultat</h3>
      {lop.map((l) => (
        <div key={`${l.eventor_id}-${l.klasse}-${l.tid_s}`} className="resultat-lop">
          <p className="resultat-navn">
            <b>{l.navn}</b>
            <span>
              {l.type !== 'o-løp' && `${TYPE_NAVN[l.type]} · `}
              {disiplinTekst(l)} · {l.klasse}
            </span>
          </p>
          <dl className="nokkeltall">
            <div>
              <dt>Plass</dt>
              <dd>{plassTekst(l)}</dd>
            </div>
            <div>
              <dt>Bak vinner</dt>
              <dd>
                {prosent(l.prosent_bak)}
                {l.tid_s != null && l.vinnertid_s != null && l.tid_s > l.vinnertid_s && <small> +{klokke(l.tid_s - l.vinnertid_s)}</small>}
              </dd>
            </div>
            <div>
              <dt>Tid</dt>
              <dd>{l.tid_s != null ? klokke(l.tid_s) : '–'}</dd>
            </div>
            <div>
              <dt>Strekkfart</dt>
              <dd>{indeks(l.strekkfart)}</dd>
            </div>
            <div>
              <dt>Bomtid</dt>
              <dd>{l.bomtid_s != null ? klokke(l.bomtid_s) : '–'}</dd>
            </div>
          </dl>
          {l.strekk_ugyldige && l.tid_s != null && <p className="fotnote">{UGYLDIGE_STREKK}</p>}
          {l.strekk && l.strekk.length > 0 && <Strekktabell lop={l} />}
          <p className="resultat-lenker">
            <Eksternlenker lenker={l.lenker} />
          </p>
        </div>
      ))}
      {stafetter.map((s) => (
        <div key={`${s.eventor_id}-${s.etappe}`} className="resultat-lop">
          <p className="resultat-navn">
            <b>{s.navn}</b>
            <span>
              Stafett · {s.klasse} · etappe {s.etappe} · {s.status === 'OK' ? (s.plass != null ? `${s.plass}. plass` : 'fullført') : s.status}
            </span>
          </p>
          <p className="resultat-lenker">
            <Eksternlenker lenker={s.lenker} />
          </p>
        </div>
      ))}
    </section>
  )
}

/** Norsk opplisting: «7», «7 og 12», «3, 7 og 12». */
function liste(deler: string[]): string {
  return deler.length < 2 ? deler.join('') : `${deler.slice(0, -1).join(', ')} og ${deler[deler.length - 1]}`
}

function Strekktabell({ lop }: { lop: Konkurranse }) {
  const [apen, setApen] = useState(false)
  const strekk = lop.strekk ?? []
  const bom = strekk.filter((s) => s.bom).map((s) => (s.post === 'M' ? 'mål' : String(s.post)))
  const id = useId()
  return (
    <div className="strekk">
      {bom.length > 0 && (
        <p className="bom-oppsummering">
          Bom på {bom[0] === 'mål' && bom.length === 1 ? 'strekket til mål' : `post ${liste(bom)}`}
          {lop.bomtid_s != null && lop.bomtid_s > 0 && `, ${klokke(lop.bomtid_s)} tapt`}
        </p>
      )}
      <button type="button" className="lenkeknapp" onClick={() => setApen(!apen)} aria-expanded={apen} aria-controls={id}>
        {apen ? 'Skjul strekk' : `Vis strekk (${strekk.length})`}
      </button>
      <div id={id} hidden={!apen}>
        <table className="blokktabell strekktabell">
          <thead>
            <tr>
              <th scope="col">Post</th>
              <th scope="col">Tid</th>
              <th scope="col">Ref</th>
              <th scope="col">Indeks</th>
            </tr>
          </thead>
          <tbody>
            {strekk.map((s, i) => (
              <tr key={i} className={s.bom ? 'bom' : undefined}>
                <td>
                  {s.post === 'M' ? 'Mål' : s.post}
                  {s.bom && <span className="bom-merke">Bom</span>}
                </td>
                <td>{s.tid_s != null ? klokke(s.tid_s) : '–'}</td>
                <td>{s.ref_s != null ? klokke(s.ref_s) : '–'}</td>
                <td>{indeks(s.indeks, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fotnote">Ref er snittet av de tre beste strekktidene i klassen. Bom er et strekk med indeks over 1,25 × medianen for løpet.</p>
      </div>
    </div>
  )
}
