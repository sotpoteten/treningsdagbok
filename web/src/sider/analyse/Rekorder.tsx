import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { dato, km, tall, timer, ukespenn, varighetLang } from '../../data/format'
import {
  helsePerSesong,
  lengsteOpphold,
  lengsteTreningsrekke,
  manedspunkter,
  toppN,
  ukepunkter,
  type Rekke,
} from '../../data/statistikk'
import { Grafkort, Segment, Tegnforklaring } from '../../komponenter/graf/felles'
import { Stolper } from '../../komponenter/graf/Stolper'
import { ukeForDato } from '../../data/uker'
import { useUrlTilstand } from '../../komponenter/useUrlTilstand'
import type { Analysekontekst } from '../Analyse'

const OMFANG = ['alle', 'sesong'] as const
type Omfang = (typeof OMFANG)[number]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Rekorder({ k }: { k: Analysekontekst }) {
  const [omfang, setOmfang] = useUrlTilstand<Omfang>('omfang', 'alle', OMFANG)
  const fra = omfang === 'alle' ? k.sesonger[0].fra : k.valgt.fra
  const til = omfang === 'alle' ? k.sluttdato : k.valgt.til < k.sluttdato ? k.valgt.til : k.sluttdato

  const data = useMemo(() => {
    const uker = ukepunkter(k.dagbok.uker).filter((p) => p.uke.mandag >= fra && p.uke.mandag <= til && p.sum.okter > 0)
    const okter = k.dagbok.okter.filter((o) => o.dato >= fra && o.dato <= til)
    const maneder = manedspunkter(okter, fra, til).filter((m) => m.sum.okter > 0)
    return {
      ukerTimer: toppN(uker, (p) => p.sum.minutter),
      ukerKm: toppN(uker, (p) => p.sum.km),
      maneder: toppN(maneder, (m) => m.sum.minutter),
      lengsteTid: toppN(okter, (o) => o.varighet_min),
      lengsteKm: toppN(okter, (o) => o.distanse_km),
      trening: lengsteTreningsrekke(k.dagbok, fra, til),
      opphold: lengsteOpphold(k.dagbok, fra, til),
    }
  }, [k, fra, til])

  const omfangsvalg = (
    <Segment
      etikett="Omfang"
      verdi={omfang}
      onEndre={setOmfang}
      valg={[
        { id: 'alle', navn: 'Hele perioden' },
        { id: 'sesong', navn: k.valgt.navn },
      ]}
    />
  )

  return (
    <>
      <section className="analyse-del">
        <div className="del-hode">
          <h1>Rekorder</h1>
          {omfangsvalg}
        </div>

        <Toppliste
          tittel="Rekker"
          nummerert={false}
          bred
          rader={[
            rekkerad('trening', 'Flest dager på rad med trening', data.trening),
            rekkerad('opphold', 'Lengste opphold uten økter', data.opphold),
          ]}
        />

        <div className="topplister">
          <Toppliste
            tittel="Største uker, timer"
            rader={data.ukerTimer.map((p) => ({
              nokkel: p.uke.nokkel,
              lenke: `/?uke=${p.uke.nokkel}`,
              navn: `Uke ${p.uke.uke} · ${ukespenn(p.uke.mandag, p.uke.sondag)}`,
              verdi: `${timer(p.sum.minutter)} t`,
              detalj: `${km(p.sum.km)} km · ${p.sum.okter} økter`,
            }))}
          />
          <Toppliste
            tittel="Største uker, km"
            rader={data.ukerKm.map((p) => ({
              nokkel: p.uke.nokkel,
              lenke: `/?uke=${p.uke.nokkel}`,
              navn: `Uke ${p.uke.uke} · ${ukespenn(p.uke.mandag, p.uke.sondag)}`,
              verdi: `${km(p.sum.km)} km`,
              detalj: `${timer(p.sum.minutter)} t · ${p.sum.okter} økter`,
            }))}
          />
          <Toppliste
            tittel="Største måneder, timer"
            rader={data.maneder.map((m) => ({
              nokkel: m.maned,
              navn: cap(dato(`${m.maned}-01`, 'MMMM yyyy')),
              verdi: `${timer(m.sum.minutter)} t`,
              detalj: `${km(m.sum.km)} km · ${tall(m.sum.okter)} økter`,
            }))}
          />
          <Toppliste
            tittel="Lengste økter"
            rader={data.lengsteTid.map((o) => ({
              nokkel: o.id,
              lenke: `/okt/${o.id}`,
              navn: o.navn,
              verdi: varighetLang(o.varighet_min),
              detalj: `${dato(o.dato, 'd. MMM yyyy')}${o.distanse_km ? ` · ${km(o.distanse_km)} km` : ''}`,
            }))}
          />
          <Toppliste
            tittel="Lengste løpeturer"
            rader={data.lengsteKm
              .filter((o) => o.distanse_km > 0)
              .map((o) => ({
                nokkel: o.id,
                lenke: `/okt/${o.id}`,
                navn: o.navn,
                verdi: `${km(o.distanse_km)} km`,
                detalj: `${dato(o.dato, 'd. MMM yyyy')} · ${varighetLang(o.varighet_min)}`,
              }))}
          />
        </div>
      </section>
    </>
  )
}

function rekkerad(nokkel: string, navn: string, rekke: Rekke | null): Topprad {
  if (!rekke) return { nokkel, navn, verdi: '–', detalj: 'Ingen i perioden' }
  return {
    nokkel,
    lenke: `/?uke=${ukeForDato(rekke.fra)}`,
    navn,
    verdi: `${rekke.dager} dager`,
    detalj: `${dato(rekke.fra, 'd. MMM yyyy')} – ${dato(rekke.til, 'd. MMM yyyy')}`,
  }
}

interface Topprad {
  nokkel: string
  lenke?: string
  navn: string
  verdi: string
  detalj: string
}

function Toppliste({ tittel, rader, nummerert = true, bred = false }: { tittel: string; rader: Topprad[]; nummerert?: boolean; bred?: boolean }) {
  return (
    <section className={['toppliste', !nummerert && 'unummerert', bred && 'bred'].filter(Boolean).join(' ')}>
      <h2>{tittel}</h2>
      <ol>
        {rader.map((r) => {
          const innhold: ReactNode = (
            <>
              <span className="topp-navn">{r.navn}</span>
              <span className="topp-detalj">{r.detalj}</span>
              <b className="topp-verdi">{r.verdi}</b>
            </>
          )
          return <li key={r.nokkel}>{r.lenke ? <Link to={r.lenke}>{innhold}</Link> : <div>{innhold}</div>}</li>
        })}
      </ol>
    </section>
  )
}

/** Syke- og skadedager per sesong. Vises på helsesiden. */
export function SykeOgSkade({ k }: { k: Analysekontekst }) {
  const helse = useMemo(() => helsePerSesong(k.dagbok.dagerPerDato.values()), [k.dagbok])
  const punkter = k.sesonger.map((s) => ({ s, h: helse.get(s.navn) ?? { syk: 0, skadet: 0 } }))
  const serier = [
    { id: 'syk', navn: 'Syk', klasse: 'fyll-syk' },
    { id: 'skadet', navn: 'Skadet', klasse: 'fyll-skadet' },
  ]
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Sesong</th>
          <th scope="col">Syke dager</th>
          <th scope="col">Skadedager</th>
        </tr>
      </thead>
      <tbody>
        {[...punkter].reverse().map((p) => (
          <tr key={p.s.navn}>
            <th scope="row">{p.s.navn}</th>
            <td>{p.h.syk}</td>
            <td>{p.h.skadet}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort
      id="syke-skadedager"
      tittel="Syke- og skadedager per sesong"
      forklaring="Dager markert som syk eller skadet i dagboka. En dag kan være begge deler. Detaljerte sykdoms- og skadeskjemaer finnes bare fra 2025."
      tabell={tabell}
    >
      <Stolper
        punkter={punkter.map((p) => ({ nokkel: p.s.navn, verdier: { syk: p.h.syk, skadet: p.h.skadet } }))}
        serier={serier}
        hoyde={220}
        yFormat={(v) => `${v}`}
        xEtikett={(p) => p.nokkel}
        beskrivelse="Stablede stolper med syke- og skadedager per sesong"
        tips={(_, i) => (
          <>
            <b>{punkter[i].s.navn}</b>
            <span className="tips-rad">
              <i className="fyll-syk" />
              Syk <span className="tips-verdi">{punkter[i].h.syk} dager</span>
            </span>
            <span className="tips-rad">
              <i className="fyll-skadet" />
              Skadet <span className="tips-verdi">{punkter[i].h.skadet} dager</span>
            </span>
          </>
        )}
      />
      <Tegnforklaring serier={serier} />
    </Grafkort>
  )
}
