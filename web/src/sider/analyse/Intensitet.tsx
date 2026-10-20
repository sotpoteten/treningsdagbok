import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { summer } from '../../data/aggregat'
import { dato, tall, timer, ukespenn } from '../../data/format'
import {
  AKTIVITET_NAVN,
  AKTIVITETER,
  aktivitetsfordeling,
  erKvalitet,
  glidendeSnitt,
  hardeMinutter,
  KVALITET_TERSKEL_MIN,
  manedspunkter,
  okterISesong,
  ukepunkter,
} from '../../data/statistikk'
import { SONER, type Sone } from '../../data/typer'
import { ukeForDato } from '../../data/uker'
import { Grafkort, Segment, Tegnforklaring, type Seriedef } from '../../komponenter/graf/felles'
import { Stolper, type Stolpepunkt } from '../../komponenter/graf/Stolper'
import { Sonestolpe } from '../../komponenter/Sonestolpe'
import type { Analysekontekst } from '../Analyse'

const pst = (del: number, hel: number) => (hel ? `${Math.round((del / hel) * 100)} %` : '–')

export function Intensitet({ k }: { k: Analysekontekst }) {
  return (
    <>
      <Sonefordeling k={k} />
      <Intensitetstid k={k} />
      <Kvalitet k={k} />
      <Aktivitet k={k} />
    </>
  )
}

function Sonefordeling({ k }: { k: Analysekontekst }) {
  const rader = useMemo(
    () =>
      [...k.sesonger].reverse().map((s) => {
        const okter = okterISesong(k.dagbok.okter, s)
        const sum = summer(okter)
        const sone = SONER.reduce((a, z) => a + sum.sone[z], 0)
        const hard = sum.sone.I3 + sum.sone.I4 + sum.sone.I5
        // Antall uker som har gått av sesongen (hele sesongen hvis den er ferdig).
        const slutt = k.sluttdato < s.til ? k.sluttdato : s.til
        const uker = Math.max(1, (Date.parse(slutt) - Date.parse(s.fra)) / 6.048e8 + 1 / 7)
        return { s, sum, sone, hard, kvalitetPerUke: okter.filter(erKvalitet).length / uker }
      }),
    [k],
  )
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Sesong</th>
          {SONER.map((z) => (
            <th key={z} scope="col">
              {z}
            </th>
          ))}
          <th scope="col">I3–I5</th>
          <th scope="col">Kvalitet/uke</th>
        </tr>
      </thead>
      <tbody>
        {rader.map((r) => (
          <tr key={r.s.navn}>
            <th scope="row">{r.s.navn}</th>
            {SONER.map((z) => (
              <td key={z}>{pst(r.sum.sone[z], r.sone)}</td>
            ))}
            <td>{timer(r.hard)}</td>
            <td>{r.kvalitetPerUke.toLocaleString('nb-NO', { maximumFractionDigits: 1 })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort
      tittel="Intensitetsfordeling per sesong"
      forklaring="Andel av tiden i hver sone (styrke er ikke med). I3–I5 er tiden over terskel."
      tabell={tabell}
    >
      <div className="andelsliste">
        {rader.map((r) => (
          <div key={r.s.navn} className={r.s.navn === k.valgt.navn ? 'andelsrad valgt' : 'andelsrad'}>
            <span className="andel-navn">{r.s.navn}</span>
            <Sonestolpe sone={r.sum.sone} />
            <span className="andel-tall andel-i1">
              <b>{pst(r.sum.sone.I1, r.sone)}</b>
              <small>I1</small>
            </span>
            <span className="andel-tall">
              <b>{pst(r.hard, r.sone)}</b>
              <small>I3–I5</small>
            </span>
            <span className="andel-tall andel-timer">
              <b>{timer(r.hard)}</b>
              <small>t over terskel</small>
            </span>
          </div>
        ))}
      </div>
      <Tegnforklaring serier={SONER.map((z) => ({ id: z, navn: `${z} ${k.dagbok.profil.pulssoner[z].Min}–${k.dagbok.profil.pulssoner[z].Max}`, klasse: `seg-${z.toLowerCase()}` }))} />
    </Grafkort>
  )
}

function Kvalitet({ k }: { k: Analysekontekst }) {
  const navigate = useNavigate()
  const punkter = useMemo(
    () => ukepunkter(k.dagbok.uker).filter((p) => p.uke.dager[3].dato >= k.valgt.fra && p.uke.dager[3].dato <= k.valgt.til && p.uke.mandag <= k.sluttdato),
    [k],
  )
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Uke</th>
          <th scope="col">Kvalitetsøkter</th>
          <th scope="col">Konkurransedager</th>
          <th scope="col">Tid I3–I5</th>
        </tr>
      </thead>
      <tbody>
        {[...punkter].reverse().map((p) => (
          <tr key={p.uke.nokkel}>
            <th scope="row">
              <Link to={`/?uke=${p.uke.nokkel}`}>
                Uke {p.uke.uke} · {ukespenn(p.uke.mandag, p.uke.sondag)}
              </Link>
            </th>
            <td>{p.kvalitet}</td>
            <td>{p.konkurranser}</td>
            <td>{timer(p.sum.sone.I3 + p.sum.sone.I4 + p.sum.sone.I5)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort
      tittel={`Kvalitetsøkter per uke, ${k.valgt.navn}`}
      forklaring={`En kvalitetsøkt har minst ${KVALITET_TERSKEL_MIN} min i I3–I5. Brune merker viser konkurransedager. Klikk for å åpne uka.`}
      tabell={tabell}
    >
      <Stolper
        punkter={punkter.map((p) => ({
          nokkel: p.uke.nokkel,
          verdier: { kval: p.kvalitet },
          markorer: Array.from({ length: Math.min(p.konkurranser, 3) }, (_, i) => ({ klasse: `m-konk m-konk-${i}`, navn: 'Konkurranse' })),
        }))}
        serier={[{ id: 'kval', navn: 'Kvalitetsøkter', klasse: 'seg-i3' }]}
        hoyde={220}
        yFormat={(v) => tall(v)}
        xEtikett={(_, i) => {
          const t = punkter[i].uke.dager[3].dato
          const forrige = i > 0 ? punkter[i - 1].uke.dager[3].dato : ''
          return t.slice(5, 7) !== forrige.slice(5, 7) ? dato(t, 'MMM').replace('.', '') : null
        }}
        beskrivelse="Stolper med antall kvalitetsøkter per uke"
        onKlikk={(p) => navigate(`/?uke=${p.nokkel}`)}
        tips={(_, i) => {
          const p = punkter[i]
          const harde = p.uke.okter.filter(erKvalitet)
          return (
            <>
              <b>
                Uke {p.uke.uke} · {ukespenn(p.uke.mandag, p.uke.sondag)}
              </b>
              <span className="tips-tall">
                {p.kvalitet} kvalitetsøkter{p.konkurranser ? ` · ${p.konkurranser} konkurransedager` : ''}
              </span>
              {harde.map((o) => (
                <span key={o.id} className="tips-rad">
                  {o.navn} <span className="tips-verdi">{hardeMinutter(o)}′ I3+</span>
                </span>
              ))}
            </>
          )
        }}
      />
    </Grafkort>
  )
}

function Aktivitet({ k }: { k: Analysekontekst }) {
  const per = useMemo(() => k.sesonger.map((s) => ({ s, a: aktivitetsfordeling(okterISesong(k.dagbok.okter, s)) })), [k])
  const rader = [
    ...AKTIVITETER.map((id) => ({ id, navn: AKTIVITET_NAVN[id], verdi: (x: (typeof per)[number]) => x.a.min[id], del: false })),
    { id: 'otek', navn: 'O-teknikk', verdi: (x: (typeof per)[number]) => x.a.otek, del: true },
  ]
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Sesong</th>
          {rader.map((r) => (
            <th key={r.id} scope="col">
              {r.navn}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...per].reverse().map((x) => (
          <tr key={x.s.navn}>
            <th scope="row">{x.s.navn}</th>
            {rader.map((r) => (
              <td key={r.id}>{timer(r.verdi(x))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort
      tittel="Timer per aktivitet og sesong"
      forklaring="Én rad per aktivitet med egen skala, så endringene innen hver aktivitet synes. O-teknikk er en del av løpetiden."
      tabell={tabell}
    >
      <div className="multipler" style={{ gridTemplateColumns: `130px repeat(${per.length}, minmax(0, 1fr))` }}>
        <span />
        {per.map((x) => (
          <span key={x.s.navn} className={x.s.navn === k.valgt.navn ? 'multippel-kol valgt' : 'multippel-kol'}>
            {x.s.navn}
          </span>
        ))}
        {rader.map((r) => {
          const maks = Math.max(1, ...per.map((x) => r.verdi(x)))
          return [
            <span key={`${r.id}-navn`} className={r.del ? 'multippel-navn del' : 'multippel-navn'}>
              {r.navn}
            </span>,
            ...per.map((x) => {
              const v = r.verdi(x)
              return (
                <span key={`${r.id}-${x.s.navn}`} className={x.s.navn === k.valgt.navn ? 'multippel valgt' : 'multippel'} title={`${r.navn} ${x.s.navn}: ${timer(v)} t`}>
                  <i style={{ height: `${(v / maks) * 100}%` }}>
                    <span className="multippel-verdi">{v ? timer(v) : '–'}</span>
                  </i>
                </span>
              )
            }),
          ]
        })}
      </div>
    </Grafkort>
  )
}

// ── Tid med intensitet per uke eller måned ─────────────

type Opplosning = 'uke' | 'maned'
const INTENSITETSSONER = ['I3', 'I4', 'I5'] as const
const INTENSITETSSERIER: Seriedef[] = INTENSITETSSONER.map((s) => ({ id: s, navn: s, klasse: `seg-${s.toLowerCase()}` }))

interface Intensitetspunkt {
  nokkel: string
  /** Uke-nøkkel å åpne i dagboka. */
  uke: string
  etikett: string
  kort: string | null
  sone: Record<Sone, number> // minutter
  kvalitet: number
  konkurranser: number
}

const over = (p: Intensitetspunkt) => p.sone.I3 + p.sone.I4 + p.sone.I5
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Tabellcelle der 0 vises som en dempet strek, så tomme perioder synes uten å lese tallene. */
function Celle({ verdi, vis = String }: { verdi: number; vis?: (v: number) => string }) {
  return verdi ? <td>{vis(verdi)}</td> : <td className="null" aria-label="0">–</td>
}

function Intensitetstid({ k }: { k: Analysekontekst }) {
  const [opplosning, setOpplosning] = useState<Opplosning>('uke')
  const navigate = useNavigate()
  const til = k.valgt.til < k.sluttdato ? k.valgt.til : k.sluttdato

  const punkter = useMemo<Intensitetspunkt[]>(() => {
    if (opplosning === 'uke')
      return ukepunkter(k.dagbok.uker)
        .filter((p) => p.uke.dager[3].dato >= k.valgt.fra && p.uke.dager[3].dato <= k.valgt.til && p.uke.mandag <= k.sluttdato)
        .map((p, i, liste) => {
          const torsdag = p.uke.dager[3].dato
          const nyMnd = i === 0 || liste[i - 1].uke.dager[3].dato.slice(5, 7) !== torsdag.slice(5, 7)
          return {
            nokkel: p.uke.nokkel,
            uke: p.uke.nokkel,
            etikett: `Uke ${p.uke.uke} · ${ukespenn(p.uke.mandag, p.uke.sondag)}`,
            kort: nyMnd ? dato(torsdag, 'MMM').replace('.', '') : null,
            sone: p.sum.sone,
            kvalitet: p.kvalitet,
            konkurranser: p.konkurranser,
          }
        })
    const okter = okterISesong(k.dagbok.okter, k.valgt)
    return manedspunkter(okter, k.valgt.fra, til).map((p) => {
      const forste = `${p.maned}-01`
      let konkurranser = 0
      for (const [d, r] of k.dagbok.dagerPerDato) if (r.konkurranse && d.startsWith(p.maned)) konkurranser++
      return {
        nokkel: p.maned,
        uke: ukeForDato(forste),
        etikett: cap(dato(forste, 'MMMM yyyy')),
        kort: dato(forste, 'MMM').replace('.', ''),
        sone: p.sum.sone,
        kvalitet: okter.filter((o) => o.dato.startsWith(p.maned) && erKvalitet(o)).length,
        konkurranser,
      }
    })
  }, [k, opplosning, til])

  const snittLengde = opplosning === 'uke' ? 4 : 3
  const snitt = useMemo(() => glidendeSnitt(punkter.map((p) => over(p) / 60), snittLengde), [punkter, snittLengde])
  const stolper: Stolpepunkt[] = punkter.map((p) => ({
    nokkel: p.nokkel,
    verdier: Object.fromEntries(INTENSITETSSONER.map((s) => [s, p.sone[s] / 60])),
    markorer: Array.from({ length: Math.min(p.konkurranser, 3) }, (_, i) => ({ klasse: `m-konk m-konk-${i}`, navn: 'Konkurranse' })),
  }))
  const enhet = opplosning === 'uke' ? 'uke' : 'måned'
  // Fra øktene, ikke fra ukene: første og siste uke kan ligge delvis utenfor sesongen.
  const sum = useMemo(() => {
    const z = summer(okterISesong(k.dagbok.okter, k.valgt)).sone
    return z.I3 + z.I4 + z.I5
  }, [k])
  const indeks = new Map(punkter.map((p, i) => [p.nokkel, i]))

  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">{opplosning === 'uke' ? 'Uke' : 'Måned'}</th>
          {INTENSITETSSONER.map((s) => (
            <th key={s} scope="col">
              {s}
            </th>
          ))}
          <th scope="col">I3–I5</th>
          <th scope="col">Kvalitetsøkter</th>
          <th scope="col">Konkurransedager</th>
        </tr>
      </thead>
      <tbody>
        {[...punkter].reverse().map((p) => (
          <tr key={p.nokkel}>
            <th scope="row">
              <Link to={`/?uke=${p.uke}`}>{p.etikett}</Link>
            </th>
            {INTENSITETSSONER.map((s) => (
              <Celle key={s} verdi={p.sone[s]} vis={timer} />
            ))}
            <Celle verdi={over(p)} vis={timer} />
            <Celle verdi={p.kvalitet} />
            <Celle verdi={p.konkurranser} />
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <Grafkort
      tittel={`Tid med intensitet per ${enhet}, ${k.valgt.navn}`}
      forklaring={`Timer i I3–I5, stablet etter sone. Streken er snittet av de siste ${snittLengde} ${opplosning === 'uke' ? 'ukene' : 'månedene'}, og brune merker viser konkurransedager. Sesongen har ${timer(sum)} t i I3–I5 så langt. Klikk for å åpne i dagboka.`}
      valg={<Segment etikett="Oppløsning" verdi={opplosning} onEndre={setOpplosning} valg={[{ id: 'uke', navn: 'Uke' }, { id: 'maned', navn: 'Måned' }]} />}
      tabell={tabell}
    >
      <Stolper
        punkter={stolper}
        serier={INTENSITETSSERIER}
        linje={{ verdier: snitt, navn: 'Snitt' }}
        yFormat={(v) => `${v} t`}
        xEtikett={(_, i) => punkter[i].kort}
        beskrivelse={`Stablede stolper med timer i I3–I5 per ${enhet}`}
        onKlikk={(p) => navigate(`/?uke=${punkter[indeks.get(p.nokkel)!].uke}`)}
        tips={(_, i) => {
          const p = punkter[i]
          return (
            <>
              <b>{p.etikett}</b>
              <span className="tips-tall">
                {timer(over(p))} t i I3–I5 · {p.kvalitet} kvalitetsøkter
              </span>
              {INTENSITETSSONER.filter((s) => p.sone[s] > 0).map((s) => (
                <span key={s} className="tips-rad">
                  <i className={`seg-${s.toLowerCase()}`} />
                  {s} {timer(p.sone[s])}
                </span>
              ))}
              {p.konkurranser > 0 && <span className="tips-rad">{p.konkurranser} konkurransedager</span>}
              <span className="tips-rad dempet">
                Snitt {snittLengde} {opplosning === 'uke' ? 'uker' : 'mnd.'}: {timer(snitt[i] * 60)} t
              </span>
            </>
          )
        }}
      />
      <Tegnforklaring
        serier={[
          ...INTENSITETSSERIER,
          { id: 'snitt', navn: 'Snitt', klasse: 'linjenokkel snitt' },
          { id: 'konk', navn: 'Konkurranse', klasse: 'fyll-konk' },
        ]}
      />
    </Grafkort>
  )
}
