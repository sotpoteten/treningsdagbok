import { useMemo } from 'react'
import { summerEtter } from '../../data/aggregat'
import { dato, km, tall, timer } from '../../data/format'
import {
  endring,
  erKvalitet,
  helsePerSesong,
  okterISesong,
  perSesong,
  nokkeltallTilSammeDato,
  type Sesong,
} from '../../data/statistikk'
import { SONER } from '../../data/typer'
import { Sonestolpe } from '../../komponenter/Sonestolpe'
import type { Analysekontekst } from '../Analyse'

interface Rad {
  navn: string
  na: number | null
  forrige: number | null
  vis: (v: number) => string
  /** Tellinger (dager, økter) vises som differanse; prosent gir lite mening på små tall. */
  telling?: boolean
}

const desimal = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 })

export function Oversikt({ k }: { k: Analysekontekst }) {
  const na = useMemo(() => nokkeltallTilSammeDato(k.dagbok, k.valgt, k.sluttdato), [k])
  const for_ = useMemo(() => (k.forrige ? nokkeltallTilSammeDato(k.dagbok, k.forrige, k.sluttdato) : null), [k])
  // Når sesongen pågår, merkes kolonnene med perioden, så de ikke forveksles med hele sesonger.
  const kolonne = (s: Sesong, til: string) => (k.pagaende ? `${s.navn} til ${dato(til, 'd. MMM')}` : s.navn)

  const rader: Rad[] = [
    { navn: 'Timer', na: na.sum.minutter, forrige: for_?.sum.minutter ?? null, vis: timer },
    { navn: 'Km løping', na: na.sum.km, forrige: for_?.sum.km ?? null, vis: km },
    { navn: 'Økter', na: na.sum.okter, forrige: for_?.sum.okter ?? null, vis: tall, telling: true },
    { navn: 'Kvalitetsøkter', na: na.kvalitet, forrige: for_?.kvalitet ?? null, vis: tall, telling: true },
    { navn: 'Konkurransedager', na: na.konk, forrige: for_?.konk ?? null, vis: tall, telling: true },
    { navn: 'O-teknikk', na: na.sum.otek, forrige: for_?.sum.otek ?? null, vis: timer },
    { navn: 'Styrke', na: na.sum.styrke, forrige: for_?.sum.styrke ?? null, vis: timer },
    { navn: 'Syke dager', na: na.syk, forrige: for_?.syk ?? null, vis: tall, telling: true },
    { navn: 'Skadedager', na: na.skadet, forrige: for_?.skadet ?? null, vis: tall, telling: true },
    ...(na.hvilepuls != null || na.hrv != null || na.sovn != null
      ? [
          { navn: 'Hvilepuls, snitt', na: na.hvilepuls, forrige: for_?.hvilepuls ?? null, vis: desimal, telling: true },
          { navn: 'HRV om natta, snitt', na: na.hrv, forrige: for_?.hrv ?? null, vis: desimal, telling: true },
          { navn: 'Søvn per natt, snitt', na: na.sovn, forrige: for_?.sovn ?? null, vis: timer, telling: true },
        ]
      : []),
  ]

  return (
    <>
      <section className="analyse-del">
        <h1>Sesongen {k.valgt.navn}</h1>
        <p className="ingress">
          {k.pagaende
            ? `Fra 1. november til og med ${dato(k.sluttdato, 'd. MMMM yyyy')}, siste økt i dagboka.`
            : `Hele sesongen, 1. nov. ${k.valgt.fra.slice(0, 4)}–31. okt. ${k.valgt.til.slice(0, 4)}.`}{' '}
          {k.forrige &&
            (k.pagaende ? `Sammenlignet med samme periode i ${k.forrige.navn}.` : `Sammenlignet med hele ${k.forrige.navn}.`)}
        </p>
        <table className="nokkeltabell">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">{kolonne(k.valgt, na.til)}</th>
              {k.forrige && for_ && <th scope="col">{kolonne(k.forrige, for_.til)}</th>}
              {k.forrige && <th scope="col">Endring</th>}
            </tr>
          </thead>
          <tbody>
            {rader.map((r) => {
              const e = r.forrige != null && r.na != null ? endring(r.na, r.forrige) : null
              const d = r.forrige != null && r.na != null ? r.na - r.forrige : null
              const tegn = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±')
              const endringTekst = r.telling
                ? d == null
                  ? '–'
                  : `${tegn(d)}${r.vis(Math.abs(d))}`
                : e == null
                  ? '–'
                  : `${tegn(Math.round(e))}${Math.abs(Math.round(e))} %`
              return (
                <tr key={r.navn}>
                  <th scope="row">{r.navn}</th>
                  <td className="stor">{r.na != null ? r.vis(r.na) : '–'}</td>
                  {k.forrige && <td>{r.forrige != null ? r.vis(r.forrige) : '–'}</td>}
                  {k.forrige && <td className="endring">{endringTekst}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="fotnote">
          Kvalitetsøkt: minst 10 min i I3–I5. O-teknikk er en del av løpetiden og inngår allerede i timene.
        </p>
      </section>
      <Sesongtabell k={k} />
    </>
  )
}

function Sesongtabell({ k }: { k: Analysekontekst }) {
  const sum = useMemo(() => summerEtter(k.dagbok.okter, perSesong), [k.dagbok])
  const helse = useMemo(() => helsePerSesong(k.dagbok.dagerPerDato.values()), [k.dagbok])
  const rader = [...k.sesonger].reverse()
  return (
    <section className="analyse-del">
      <h2>Alle sesonger</h2>
      <div className="tabellrull">
        <table className="arstabell">
          <thead>
            <tr>
              <th scope="col">Sesong</th>
              <th scope="col">Økter</th>
              <th scope="col">Timer</th>
              <th scope="col">Km</th>
              <th scope="col" className="stolpekol">
                Soner
              </th>
              {SONER.map((s) => (
                <th key={s} scope="col">
                  {s}
                </th>
              ))}
              <th scope="col">Styrke</th>
              <th scope="col">O-tek.</th>
              <th scope="col">Kvalitet</th>
              <th scope="col">Syk</th>
              <th scope="col">Skadet</th>
            </tr>
          </thead>
          <tbody>
            {rader.map((s) => {
              const x = sum.get(s.navn)
              if (!x) return null
              const kvalitet = okterISesong(k.dagbok.okter, s).filter(erKvalitet).length
              const h = helse.get(s.navn)
              const pagaende = s.navn === k.sesonger[k.sesonger.length - 1].navn && k.dagbok.sisteDato < s.til
              return (
                <tr key={s.navn} className={s.navn === k.valgt.navn ? 'valgt' : undefined}>
                  <th scope="row">
                    {s.navn}
                    {pagaende && <span className="hint"> pågår</span>}
                  </th>
                  <td>{tall(x.okter)}</td>
                  <td>{timer(x.minutter)}</td>
                  <td>{km(x.km)}</td>
                  <td className="stolpekol">
                    <Sonestolpe sone={x.sone} styrke={x.styrke} />
                  </td>
                  {SONER.map((z) => (
                    <td key={z}>{timer(x.sone[z])}</td>
                  ))}
                  <td>{timer(x.styrke)}</td>
                  <td>{timer(x.otek)}</td>
                  <td>{tall(kvalitet)}</td>
                  <td>{h?.syk ?? 0}</td>
                  <td>{h?.skadet ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {k.pagaende && k.forrige && <p className="fotnote">Hele sesonger. Sammenligningen over går til samme dato.</p>}
    </section>
  )
}
