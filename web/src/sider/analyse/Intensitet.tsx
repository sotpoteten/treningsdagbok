import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { summer } from '../../data/aggregat'
import { dato, tall, timer, ukespenn } from '../../data/format'
import {
  AKTIVITET_NAVN,
  AKTIVITETER,
  aktivitetsfordeling,
  erKvalitet,
  hardeMinutter,
  KVALITET_TERSKEL_MIN,
  okterISesong,
  ukepunkter,
} from '../../data/statistikk'
import { SONER } from '../../data/typer'
import { Grafkort, Tegnforklaring } from '../../komponenter/graf/felles'
import { Stolper } from '../../komponenter/graf/Stolper'
import { Sonestolpe } from '../../komponenter/Sonestolpe'
import type { Analysekontekst } from '../Analyse'

const pst = (del: number, hel: number) => (hel ? `${Math.round((del / hel) * 100)} %` : '–')

export function Intensitet({ k }: { k: Analysekontekst }) {
  return (
    <>
      <Sonefordeling k={k} />
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
