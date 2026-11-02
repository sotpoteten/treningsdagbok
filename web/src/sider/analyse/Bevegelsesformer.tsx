import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { cap, dato, km, pulsomrade, sesongKort, timer, ukespenn } from '../../data/format'
import {
  AKTIVITET_NAVN,
  AKTIVITETER,
  aktivitetsfordeling,
  arshjul,
  glidendeSnitt,
  manedspunkter,
  okterISesong,
  otekfordeling,
  OTEKNIKK,
  OTEKNIKK_NAVN,
  SONEFORMER,
  sonerPerForm,
  ukepunkter,
  UNDERLAG,
  UNDERLAG_NAVN,
  underlagsfordeling,
  type Aktivitet,
  type Sesong,
} from '../../data/statistikk'
import { SONER, type Okt } from '../../data/typer'
import { ukeForDato } from '../../data/uker'
import { Grafkort, Segment, Tegnforklaring, type Seriedef } from '../../komponenter/graf/felles'
import { Stolper, type Stolpepunkt } from '../../komponenter/graf/Stolper'
import { Sonestolpe } from '../../komponenter/Sonestolpe'
import { useUrlTilstand } from '../../komponenter/useUrlTilstand'
import type { Analysekontekst } from '../Analyse'

// Siden bruker en egen kategoripalett for bevegelsesformene (--f-*), et unntak fra regelen
// om ingen ny kategoripalett. Se DESIGN.md. Styrke er skravert som ellers.
const FORMSERIER: Seriedef[] = AKTIVITETER.map((id) => ({ id, navn: AKTIVITET_NAVN[id], klasse: id === 'styrke' ? 'seg-styrke' : `seg-f-${id}` }))
const UNDERLAG_KLASSE = { terreng: 'seg-f-loping', sti: 'seg-f-sti', molle: 'seg-f-molle' } as const

const OPPLOSNINGER = ['uke', 'maned'] as const
type Opplosning = (typeof OPPLOSNINGER)[number]
const PERIODER = ['sesong', 'alle'] as const
type Periode = (typeof PERIODER)[number]

const pst = (del: number, hel: number) => (hel ? `${Math.round((del / hel) * 100)} %` : '–')

export function Bevegelsesformer({ k }: { k: Analysekontekst }) {
  return (
    <>
      <Tidsfordeling k={k} />
      <PerSesong k={k} />
      <Arshjul k={k} />
      <Underlaget k={k} />
      <IntensitetPerForm k={k} />
      <Oteknikk k={k} />
    </>
  )
}

/** Tabellcelle der 0 vises som en dempet strek. */
function Celle({ verdi, vis = timer }: { verdi: number; vis?: (v: number) => string }) {
  return verdi ? <td>{vis(verdi)}</td> : <td className="null" aria-label="0">–</td>
}

// ── Timer per bevegelsesform og uke eller måned ────────

interface Punkt {
  nokkel: string
  /** Uke-nøkkel å åpne i dagboka. */
  uke: string
  etikett: string
  kort: string | null
  /** Minutter per bevegelsesform. */
  min: Record<Aktivitet, number>
  otek: number
  totalt: number
}

function Tidsfordeling({ k }: { k: Analysekontekst }) {
  const [opplosning, setOpplosning] = useUrlTilstand<Opplosning>('opplosning', 'uke', OPPLOSNINGER)
  const [periode, setPeriode] = useUrlTilstand<Periode>('periode', 'sesong', PERIODER)
  const navigate = useNavigate()

  const fra = periode === 'sesong' ? k.valgt.fra : k.sesonger[0].fra
  const til = periode === 'sesong' ? (k.valgt.til < k.sluttdato ? k.valgt.til : k.sluttdato) : k.sluttdato

  const punkter = useMemo<Punkt[]>(() => {
    const fordeling = (okter: Okt[]) => {
      const a = aktivitetsfordeling(okter)
      return { min: a.min, otek: a.otek, totalt: AKTIVITETER.reduce((s, id) => s + a.min[id], 0) }
    }
    if (opplosning === 'uke')
      return ukepunkter(k.dagbok.uker)
        .filter((p) => p.uke.dager[3].dato >= fra && p.uke.dager[3].dato <= til)
        .map((p, i, liste) => {
          const torsdag = p.uke.dager[3].dato
          const nyMnd = i === 0 || liste[i - 1].uke.dager[3].dato.slice(5, 7) !== torsdag.slice(5, 7)
          const kort = periode === 'sesong' ? (nyMnd ? dato(torsdag, 'MMM').replace('.', '') : null) : nyMnd && torsdag.slice(5, 7) === '11' ? sesongKort(torsdag) : null
          return { nokkel: p.uke.nokkel, uke: p.uke.nokkel, etikett: `Uke ${p.uke.uke} · ${ukespenn(p.uke.mandag, p.uke.sondag)}`, kort, ...fordeling(p.uke.okter) }
        })
    const okter = k.dagbok.okter.filter((o) => o.dato >= fra && o.dato <= til)
    return manedspunkter(okter, fra, til).map((p) => {
      const forste = `${p.maned}-01`
      return {
        nokkel: p.maned,
        uke: ukeForDato(forste),
        etikett: cap(dato(forste, 'MMMM yyyy')),
        kort: periode === 'sesong' ? dato(forste, 'MMM').replace('.', '') : p.maned.endsWith('-11') ? sesongKort(forste) : null,
        ...fordeling(okter.filter((o) => o.dato.startsWith(p.maned))),
      }
    })
  }, [k, opplosning, periode, fra, til])

  const snittLengde = opplosning === 'uke' ? 4 : 3
  const snitt = useMemo(() => glidendeSnitt(punkter.map((p) => p.totalt / 60), snittLengde), [punkter, snittLengde])
  const stolper: Stolpepunkt[] = punkter.map((p) => ({ nokkel: p.nokkel, verdier: Object.fromEntries(AKTIVITETER.map((id) => [id, p.min[id] / 60])) }))
  const enhet = opplosning === 'uke' ? 'uke' : 'måned'
  const indeks = new Map(punkter.map((p, i) => [p.nokkel, i]))

  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">{opplosning === 'uke' ? 'Uke' : 'Måned'}</th>
          <th scope="col">Timer</th>
          {AKTIVITETER.map((id) => (
            <th key={id} scope="col">
              {AKTIVITET_NAVN[id]}
            </th>
          ))}
          <th scope="col">O-teknikk</th>
        </tr>
      </thead>
      <tbody>
        {[...punkter].reverse().map((p) => (
          <tr key={p.nokkel}>
            <th scope="row">
              <Link to={`/?uke=${p.uke}`}>{p.etikett}</Link>
            </th>
            <Celle verdi={p.totalt} />
            {AKTIVITETER.map((id) => (
              <Celle key={id} verdi={p.min[id]} />
            ))}
            <Celle verdi={p.otek} />
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <Grafkort
      id="bevegelsesformer"
      tittel={`Timer per bevegelsesform og ${enhet}`}
      forklaring={`Stablet etter bevegelsesform. Streken er snittet av de siste ${snittLengde} ${opplosning === 'uke' ? 'ukene' : 'månedene'}. O-teknikk er en del av løpetiden og står i verktøytipset. Klikk for å åpne i dagboka.`}
      forklaringTabell={`Timer per bevegelsesform og ${enhet}. O-teknikk er en del av løpetiden og er ikke med i Timer. Klikk en ${enhet} for å åpne den i dagboka.`}
      valg={
        <>
          <Segment etikett="Oppløsning" verdi={opplosning} onEndre={setOpplosning} valg={[{ id: 'uke', navn: 'Uke' }, { id: 'maned', navn: 'Måned' }]} />
          <Segment etikett="Periode" verdi={periode} onEndre={setPeriode} valg={[{ id: 'sesong', navn: k.valgt.navn }, { id: 'alle', navn: 'Alle sesonger' }]} />
        </>
      }
      tabell={tabell}
    >
      <Stolper
        punkter={stolper}
        serier={FORMSERIER}
        linje={{ verdier: snitt, navn: 'Snitt' }}
        yFormat={(v) => `${v} t`}
        xEtikett={(p) => punkter[indeks.get(p.nokkel)!].kort}
        beskrivelse={`Stablede stolper med timer per ${enhet}, fordelt på bevegelsesform`}
        onKlikk={(p) => navigate(`/?uke=${punkter[indeks.get(p.nokkel)!].uke}`)}
        tips={(_, i) => {
          const p = punkter[i]
          return (
            <>
              <b>{p.etikett}</b>
              <span className="tips-tall">{timer(p.totalt)} t</span>
              {FORMSERIER.filter((f) => p.min[f.id as Aktivitet] > 0).map((f) => (
                <span key={f.id} className="tips-rad">
                  <i className={f.klasse} />
                  {f.navn} {timer(p.min[f.id as Aktivitet])}
                </span>
              ))}
              {p.otek > 0 && <span className="tips-rad">O-teknikk {timer(p.otek)} (av løpingen)</span>}
              <span className="tips-rad dempet">
                Snitt {snittLengde} {opplosning === 'uke' ? 'uker' : 'mnd.'}: {timer(snitt[i] * 60)} t
              </span>
            </>
          )
        }}
      />
      <Tegnforklaring serier={[...FORMSERIER, { id: 'snitt', navn: 'Snitt', klasse: 'linjenokkel snitt' }]} />
    </Grafkort>
  )
}

// ── Små multipler per sesong ───────────────────────────

interface Multippelrad<T> {
  id: string
  navn: string
  /** Delmengde av en annen rad, f.eks. o-teknikk av løpingen. Navnet dempes. */
  del?: boolean
  verdi: (x: T) => number
  vis?: (v: number) => string
}

/** Én rad per mål med egen skala, én kolonne per sesong. Valgt sesong i rutenettblått. */
function Multipler<T extends { s: Sesong }>({ per, rader, valgt }: { per: T[]; rader: Multippelrad<T>[]; valgt: string }) {
  return (
    <div className="multipler" style={{ gridTemplateColumns: `130px repeat(${per.length}, minmax(0, 1fr))` }}>
      <span />
      {per.map((x) => (
        <span key={x.s.navn} className={x.s.navn === valgt ? 'multippel-kol valgt' : 'multippel-kol'}>
          {x.s.navn}
        </span>
      ))}
      {rader.map((r) => {
        const maks = Math.max(1e-9, ...per.map((x) => r.verdi(x)))
        const vis = r.vis ?? timer
        return [
          <span key={`${r.id}-navn`} className={r.del ? 'multippel-navn del' : 'multippel-navn'}>
            {r.navn}
          </span>,
          ...per.map((x) => {
            const v = r.verdi(x)
            return (
              <span key={`${r.id}-${x.s.navn}`} className={x.s.navn === valgt ? 'multippel valgt' : 'multippel'} title={`${r.navn} ${x.s.navn}: ${vis(v)}`}>
                <i style={{ height: `${(v / maks) * 100}%` }}>
                  <span className="multippel-verdi">{v ? vis(v) : '–'}</span>
                </i>
              </span>
            )
          }),
        ]
      })}
    </div>
  )
}

function PerSesong({ k }: { k: Analysekontekst }) {
  const per = useMemo(() => k.sesonger.map((s) => ({ s, a: aktivitetsfordeling(okterISesong(k.dagbok.okter, s)) })), [k])
  type X = (typeof per)[number]
  const rader: Multippelrad<X>[] = [
    ...AKTIVITETER.map((id) => ({ id, navn: AKTIVITET_NAVN[id], verdi: (x: X) => x.a.min[id] })),
    { id: 'otek', navn: 'O-teknikk', verdi: (x) => x.a.otek, del: true },
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
      id="aktiviteter"
      tittel="Timer per bevegelsesform og sesong"
      forklaring="Én rad per bevegelsesform med egen skala, så endringene innen hver form synes. O-teknikk er en del av løpetiden."
      forklaringTabell="Timer per bevegelsesform, én rad per sesong. O-teknikk er en del av løpetiden og er ikke med i de andre kolonnene."
      tabell={tabell}
    >
      <Multipler per={per} rader={rader} valgt={k.valgt.navn} />
    </Grafkort>
  )
}

// ── Årshjul ────────────────────────────────────────────

const MANEDSNAVN: Record<string, string> = { '11': 'nov', '12': 'des', '01': 'jan', '02': 'feb', '03': 'mar', '04': 'apr', '05': 'mai', '06': 'jun', '07': 'jul', '08': 'aug', '09': 'sep', '10': 'okt' }

function Arshjul({ k }: { k: Analysekontekst }) {
  const h = useMemo(() => arshjul(k.dagbok.okter, k.sesonger, k.sluttdato), [k])
  const former = AKTIVITETER.filter((f) => h.snitt[f].some((v) => v > 0))
  // Fargetrinn h1–h6 etter andelen av radens største måned, så sesongmønsteret synes også
  // for små former. Tallet i cellen er alltid timer.
  const trinn = (v: number, maks: number) => (v > 0 ? Math.max(1, Math.ceil((v / maks) * 6)) : 0)
  return (
    <Grafkort
      id="arshjul"
      tittel="Årshjul: timer per måned i snitt"
      forklaring={`Snitt timer per kalendermåned over sesongene, ${h.antall[0]} for november og ${h.antall[11]} for oktober, fordi bare hele måneder er med. Fargen går fra lys til mørk etter radens største måned, så mønsteret synes også for små former.`}
      forklaringTabell="Snitt timer per kalendermåned over sesongene, med antall sesonger måneden bygger på."
      tabell={() => (
        <table className="arstabell">
          <thead>
            <tr>
              <th scope="col">Måned</th>
              <th scope="col">Sesonger</th>
              {former.map((f) => (
                <th key={f} scope="col">
                  {AKTIVITET_NAVN[f]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.maneder.map((m, i) => (
              <tr key={m}>
                <th scope="row">{cap(MANEDSNAVN[m])}</th>
                <td>{h.antall[i]}</td>
                {former.map((f) => (
                  <Celle key={f} verdi={h.snitt[f][i]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    >
      <div className="arshjul-ramme">
        <table className="arshjul">
          <thead>
            <tr>
              <th scope="col">
                <span className="skjult">Bevegelsesform</span>
              </th>
              {h.maneder.map((m) => (
                <th key={m} scope="col">
                  {MANEDSNAVN[m]}
                </th>
              ))}
              <th scope="col" className="sum">
                År
              </th>
            </tr>
          </thead>
          <tbody>
            {former.map((f) => {
              const maks = Math.max(...h.snitt[f])
              return (
                <tr key={f}>
                  <th scope="row">{AKTIVITET_NAVN[f]}</th>
                  {h.snitt[f].map((v, i) => (
                    <td key={i} className={`trinn-${trinn(v, maks)}`} title={`${AKTIVITET_NAVN[f]}, ${MANEDSNAVN[h.maneder[i]]}: ${timer(v)} t i snitt over ${h.antall[i]} sesonger`}>
                      {v >= 30 ? Math.round(v / 60) : v > 0 ? '<1' : '–'}
                    </td>
                  ))}
                  <td className="sum">{Math.round(h.snitt[f].reduce((a, v) => a + v, 0) / 60)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="fotnote">Hele timer i snitt per måned. «År» er summen av månedene.</p>
    </Grafkort>
  )
}

// ── Underlaget i løpingen ──────────────────────────────

/** Vannrett stablet stolpe av deler, med 2 px mellomrom som Sonestolpe. */
function Andelsstolpe({ deler }: { deler: { id: string; navn: string; verdi: number; klasse: string; vis: string }[] }) {
  const synlige = deler.filter((d) => d.verdi > 0)
  const sum = synlige.reduce((a, d) => a + d.verdi, 0)
  if (!sum) return <div className="sonestolpe tom" aria-hidden />
  const tekst = synlige.map((d) => `${d.navn} ${d.vis}`).join(', ')
  return (
    <div className="sonestolpe" role="img" aria-label={tekst} title={tekst}>
      {synlige.map((d) => (
        <i key={d.id} className={`seg ${d.klasse}`} style={{ flexGrow: d.verdi / sum }} />
      ))}
    </div>
  )
}

function Underlaget({ k }: { k: Analysekontekst }) {
  const rader = useMemo(() => [...k.sesonger].reverse().map((s) => ({ s, u: underlagsfordeling(okterISesong(k.dagbok.okter, s)) })), [k])
  const tid = (r: (typeof rader)[number]) => UNDERLAG.reduce((a, u) => a + r.u.min[u], 0)
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Sesong</th>
          {UNDERLAG.map((u) => (
            <th key={u} scope="col">
              {UNDERLAG_NAVN[u]}, t
            </th>
          ))}
          {UNDERLAG.map((u) => (
            <th key={`${u}-km`} scope="col">
              {UNDERLAG_NAVN[u]}, km
            </th>
          ))}
          <th scope="col">Andel terreng</th>
        </tr>
      </thead>
      <tbody>
        {rader.map((r) => (
          <tr key={r.s.navn}>
            <th scope="row">{r.s.navn}</th>
            {UNDERLAG.map((u) => (
              <Celle key={u} verdi={r.u.min[u]} />
            ))}
            {UNDERLAG.map((u) => (
              <Celle key={`${u}-km`} verdi={r.u.km[u]} vis={km} />
            ))}
            <td>{pst(r.u.min.terreng, tid(r))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort id="underlag" tittel="Underlaget i løpingen per sesong" forklaring="Løpetiden fordelt på terreng, sti/vei og mølle. Andelen er av tiden, ikke av km." tabell={tabell}>
      <div className="andelsliste underlagliste">
        {rader.map((r) => (
          <div key={r.s.navn} className={r.s.navn === k.valgt.navn ? 'andelsrad valgt' : 'andelsrad'}>
            <span className="andel-navn">{r.s.navn}</span>
            <Andelsstolpe deler={UNDERLAG.map((u) => ({ id: u, navn: UNDERLAG_NAVN[u], verdi: r.u.min[u], klasse: UNDERLAG_KLASSE[u], vis: `${timer(r.u.min[u])} t` }))} />
            {/* Andelen står i midten, fordi den er den eneste som vises på mobil. */}
            <span className="andel-tall andel-i1">
              <b>{km(r.u.km.terreng)}</b>
              <small>km terreng</small>
            </span>
            <span className="andel-tall">
              <b>{pst(r.u.min.terreng, tid(r))}</b>
              <small>terreng</small>
            </span>
            <span className="andel-tall andel-timer">
              <b>{timer(r.u.min.molle)}</b>
              <small>t mølle</small>
            </span>
          </div>
        ))}
      </div>
      <Tegnforklaring serier={UNDERLAG.map((u) => ({ id: u, navn: UNDERLAG_NAVN[u], klasse: UNDERLAG_KLASSE[u] }))} />
    </Grafkort>
  )
}

// ── Intensitet per bevegelsesform ──────────────────────

function IntensitetPerForm({ k }: { k: Analysekontekst }) {
  const soner = useMemo(() => sonerPerForm(okterISesong(k.dagbok.okter, k.valgt)), [k])
  const rader = SONEFORMER.map((f) => {
    const z = soner[f]
    const total = SONER.reduce((a, s) => a + z[s], 0)
    return { f, z, total, hard: z.I3 + z.I4 + z.I5 }
  }).filter((r) => r.total > 0)
  const hardTotalt = rader.reduce((a, r) => a + r.hard, 0)
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Form</th>
          {SONER.map((s) => (
            <th key={s} scope="col">
              {s}
            </th>
          ))}
          <th scope="col">I3–I5</th>
          <th scope="col">Andel av I3–I5</th>
        </tr>
      </thead>
      <tbody>
        {rader.map((r) => (
          <tr key={r.f}>
            <th scope="row">{AKTIVITET_NAVN[r.f]}</th>
            {SONER.map((s) => (
              <Celle key={s} verdi={r.z[s]} />
            ))}
            <Celle verdi={r.hard} />
            <td>{pst(r.hard, hardTotalt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort
      id="intensitet-per-form"
      tittel={`Intensitet per bevegelsesform, ${k.valgt.navn}`}
      forklaring="Sonefordelingen innen hver bevegelsesform. «Av I3–I5» er hvor stor del av sesongens tid over terskel som kommer fra formen."
      forklaringTabell="Timer i hver sone per bevegelsesform, og hvor stor del av sesongens tid i I3–I5 som kommer fra formen."
      tabell={tabell}
    >
      <div className="andelsliste formliste">
        {rader.map((r) => (
          <div key={r.f} className="andelsrad">
            <span className="andel-navn">{AKTIVITET_NAVN[r.f]}</span>
            <Sonestolpe sone={r.z} />
            <span className="andel-tall andel-i1">
              <b>{pst(r.z.I1, r.total)}</b>
              <small>I1</small>
            </span>
            <span className="andel-tall">
              <b>{pst(r.hard, r.total)}</b>
              <small>I3–I5</small>
            </span>
            <span className="andel-tall andel-timer">
              <b>{pst(r.hard, hardTotalt)}</b>
              <small>av I3–I5</small>
            </span>
          </div>
        ))}
      </div>
      <Tegnforklaring serier={SONER.map((z) => ({ id: z, navn: `${z} ${pulsomrade(k.dagbok.profil.pulssoner, z)}`, klasse: `seg-${z.toLowerCase()}` }))} />
    </Grafkort>
  )
}

// ── O-teknikk ──────────────────────────────────────────

function Oteknikk({ k }: { k: Analysekontekst }) {
  const per = useMemo(
    () =>
      k.sesonger.map((s) => {
        const okter = okterISesong(k.dagbok.okter, s)
        return { s, t: otekfordeling(okter), loping: aktivitetsfordeling(okter).min.loping }
      }),
    [k],
  )
  type X = (typeof per)[number]
  const sum = (x: X) => OTEKNIKK.reduce((a, t) => a + x.t[t], 0)
  const andel = (x: X) => (x.loping ? (sum(x) / x.loping) * 100 : 0)
  const prosent = (v: number) => `${Math.round(v)} %`
  const rader: Multippelrad<X>[] = [
    ...OTEKNIKK.map((t) => ({ id: t, navn: OTEKNIKK_NAVN[t], verdi: (x: X) => x.t[t] })),
    { id: 'andel', navn: 'Andel av løpetiden', verdi: andel, vis: prosent, del: true },
  ]
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Sesong</th>
          {OTEKNIKK.map((t) => (
            <th key={t} scope="col">
              {OTEKNIKK_NAVN[t]}
            </th>
          ))}
          <th scope="col">Totalt</th>
          <th scope="col">Andel av løpetiden</th>
        </tr>
      </thead>
      <tbody>
        {[...per].reverse().map((x) => (
          <tr key={x.s.navn}>
            <th scope="row">{x.s.navn}</th>
            {OTEKNIKK.map((t) => (
              <Celle key={t} verdi={x.t[t]} />
            ))}
            <Celle verdi={sum(x)} />
            <td>{prosent(andel(x))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <Grafkort
      id="oteknikk"
      tittel="O-teknikk per sesong"
      forklaring="Timer o-teknikk i nordisk, kontinentalt og sprintterreng, og hvor stor del av løpetiden som var o-teknikk. Hver rad har egen skala."
      tabell={tabell}
    >
      <Multipler per={per} rader={rader} valgt={k.valgt.navn} />
    </Grafkort>
  )
}
