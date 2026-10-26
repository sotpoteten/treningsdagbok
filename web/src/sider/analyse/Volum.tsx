import { Cross, Thermometer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { dato, km, tall, timer, ukespenn } from '../../data/format'
import { glidendeSnitt, manedspunkter, ukepunkter } from '../../data/statistikk'
import type { Sum } from '../../data/aggregat'
import { SONER } from '../../data/typer'
import { ukeForDato } from '../../data/uker'
import { Grafkort, Segment, Tegnforklaring, type Seriedef } from '../../komponenter/graf/felles'
import { Stolper, type Stolpepunkt } from '../../komponenter/graf/Stolper'
import type { Analysekontekst } from '../Analyse'

type Opplosning = 'uke' | 'maned'
type Periode = 'sesong' | 'alle'

const SONESERIER: Seriedef[] = [
  ...SONER.map((s) => ({ id: s, navn: s, klasse: `seg-${s.toLowerCase()}` })),
  { id: 'styrke', navn: 'Styrke', klasse: 'seg-styrke' },
]
const KMSERIE: Seriedef[] = [{ id: 'km', navn: 'Km løping', klasse: 'fyll-volum' }]

interface Punkt {
  nokkel: string
  /** Uke-nøkkel å åpne i dagboka. */
  uke: string
  etikett: string // til verktøytips og tabell
  kort: string | null // x-akse
  sum: Sum
  /** Antall dager markert som syk eller skadet i perioden. */
  syk: number
  skadet: number
}

export function Volum({ k }: { k: Analysekontekst }) {
  const [opplosning, setOpplosning] = useState<Opplosning>('uke')
  const [periode, setPeriode] = useState<Periode>('sesong')
  const navigate = useNavigate()

  const fra = periode === 'sesong' ? k.valgt.fra : k.sesonger[0].fra
  const til = periode === 'sesong' ? (k.valgt.til < k.sluttdato ? k.valgt.til : k.sluttdato) : k.sluttdato

  const punkter = useMemo<Punkt[]>(() => {
    if (opplosning === 'uke') {
      return ukepunkter(k.dagbok.uker)
        .filter((p) => p.uke.dager[3].dato >= fra && p.uke.dager[3].dato <= til)
        .map((p, i, liste) => {
          const torsdag = p.uke.dager[3].dato
          const forrigeMnd = i > 0 ? liste[i - 1].uke.dager[3].dato.slice(5, 7) : ''
          const nyMnd = torsdag.slice(5, 7) !== forrigeMnd
          const kort =
            periode === 'sesong'
              ? nyMnd
                ? dato(torsdag, 'MMM').replace('.', '')
                : null
              : nyMnd && torsdag.slice(5, 7) === '11'
                ? sesongKort(torsdag)
                : null
          return {
            nokkel: p.uke.nokkel,
            uke: p.uke.nokkel,
            etikett: `Uke ${p.uke.uke} · ${ukespenn(p.uke.mandag, p.uke.sondag)}`,
            kort,
            sum: p.sum,
            syk: p.uke.dager.filter((d) => d.dato >= fra && d.rapport?.syk).length,
            skadet: p.uke.dager.filter((d) => d.dato >= fra && d.rapport?.skadet).length,
          }
        })
    }
    const helse = new Map<string, { syk: number; skadet: number }>()
    for (const [d, r] of k.dagbok.dagerPerDato) {
      const m = d.slice(0, 7)
      const h = helse.get(m) ?? { syk: 0, skadet: 0 }
      helse.set(m, { syk: h.syk + (r.syk ? 1 : 0), skadet: h.skadet + (r.skadet ? 1 : 0) })
    }
    return manedspunkter(k.dagbok.okter, fra, til).map((p) => {
      const forste = `${p.maned}-01`
      return {
        nokkel: p.maned,
        uke: ukeForDato(forste),
        etikett: cap(dato(forste, 'MMMM yyyy')),
        kort: periode === 'sesong' ? dato(forste, 'MMM').replace('.', '') : p.maned.endsWith('-11') ? sesongKort(forste) : null,
        sum: p.sum,
        syk: helse.get(p.maned)?.syk ?? 0,
        skadet: helse.get(p.maned)?.skadet ?? 0,
      }
    })
  }, [k, opplosning, periode, fra, til])

  const snittLengde = opplosning === 'uke' ? 4 : 3
  const timerSnitt = useMemo(() => glidendeSnitt(punkter.map((p) => p.sum.minutter / 60), snittLengde), [punkter, snittLengde])
  const kmSnitt = useMemo(() => glidendeSnitt(punkter.map((p) => p.sum.km), snittLengde), [punkter, snittLengde])

  const timerPunkter: Stolpepunkt[] = punkter.map((p) => ({
    nokkel: p.nokkel,
    verdier: { ...Object.fromEntries(SONER.map((s) => [s, p.sum.sone[s] / 60])), styrke: p.sum.styrke / 60 },
    markorer: [
      ...(p.syk ? [{ klasse: 'm-syk', navn: 'Syk', ikon: 'syk' as const, antall: p.syk }] : []),
      ...(p.skadet ? [{ klasse: 'm-skadet', navn: 'Skadet', ikon: 'skadet' as const, antall: p.skadet }] : []),
    ],
  }))
  const kmPunkter: Stolpepunkt[] = punkter.map((p) => ({ nokkel: p.nokkel, verdier: { km: p.sum.km } }))

  const enhet = opplosning === 'uke' ? 'uke' : 'måned'
  const apne = (i: number) => navigate(`/?uke=${punkter[i].uke}`)
  const valg = (
    <>
      <Segment etikett="Oppløsning" verdi={opplosning} onEndre={setOpplosning} valg={[{ id: 'uke', navn: 'Uke' }, { id: 'maned', navn: 'Måned' }]} />
      <Segment etikett="Periode" verdi={periode} onEndre={setPeriode} valg={[{ id: 'sesong', navn: k.valgt.navn }, { id: 'alle', navn: 'Alle sesonger' }]} />
    </>
  )
  const indeks = new Map(punkter.map((p, i) => [p.nokkel, i]))

  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">{opplosning === 'uke' ? 'Uke' : 'Måned'}</th>
          <th scope="col">Timer</th>
          {SONER.map((s) => (
            <th key={s} scope="col">
              {s}
            </th>
          ))}
          <th scope="col">Styrke</th>
          <th scope="col">Km</th>
          <th scope="col">Økter</th>
        </tr>
      </thead>
      <tbody>
        {[...punkter].reverse().map((p) => (
          <tr key={p.nokkel}>
            <th scope="row">
              <Link to={`/?uke=${p.uke}`}>{p.etikett}</Link>
            </th>
            <td>{timer(p.sum.minutter)}</td>
            {SONER.map((s) => (
              <td key={s}>{timer(p.sum.sone[s])}</td>
            ))}
            <td>{timer(p.sum.styrke)}</td>
            <td>{km(p.sum.km)}</td>
            <td>{tall(p.sum.okter)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <>
      <Grafkort
        tittel={`Timer per ${enhet}`}
        forklaring={`Fordelt på sone og styrke. Streken er snittet av de siste ${snittLengde} ${opplosning === 'uke' ? 'ukene' : 'månedene'}. Termometeret viser syke dager og korset skadedager, med antallet når det er flere. Klikk (eller Enter) for å åpne i dagboka.`}
        forklaringTabell={`Timer per ${enhet}, fordelt på sone og styrke, med km og antall økter. Klikk en ${enhet} for å åpne den i dagboka.`}
        valg={valg}
        tabell={tabell}
      >
        <Stolper
          punkter={timerPunkter}
          serier={SONESERIER}
          linje={{ verdier: timerSnitt, navn: 'Snitt' }}
          yFormat={(v) => `${v} t`}
          xEtikett={(p) => punkter[indeks.get(p.nokkel)!].kort}
          beskrivelse={`Stablede stolper med timer per ${enhet}, fordelt på sone`}
          onKlikk={(p) => apne(indeks.get(p.nokkel)!)}
          tips={(_, i) => <Volumtips p={punkter[i]} snitt={timerSnitt[i]} snittLengde={snittLengde} enhet={enhet} />}
        />
        <Tegnforklaring
          serier={[
            ...SONESERIER,
            { id: 'snitt', navn: 'Snitt', klasse: 'linjenokkel snitt' },
            { id: 'syk', navn: 'Syk', klasse: 'm-syk', ikon: <Thermometer aria-hidden /> },
            { id: 'skadet', navn: 'Skadet', klasse: 'm-skadet', ikon: <Cross aria-hidden /> },
          ]}
        />
      </Grafkort>

      <Grafkort
        tittel={`Km løping per ${enhet}`}
        forklaring="Distanse finnes bare for løping."
        tabell={tabell}
      >
        <Stolper
          punkter={kmPunkter}
          serier={KMSERIE}
          hoyde={200}
          linje={{ verdier: kmSnitt, navn: 'Snitt' }}
          yFormat={(v) => `${v} km`}
          xEtikett={(p) => punkter[indeks.get(p.nokkel)!].kort}
          beskrivelse={`Stolper med løpe-km per ${enhet}`}
          onKlikk={(p) => apne(indeks.get(p.nokkel)!)}
          tips={(_, i) => (
            <>
              <b>{punkter[i].etikett}</b>
              <span className="tips-tall">{km(punkter[i].sum.km)} km</span>
              <span className="tips-rad">
                Snitt {snittLengde}: {km(kmSnitt[i])} km
              </span>
            </>
          )}
        />
        <Tegnforklaring serier={[...KMSERIE, { id: 'snitt', navn: 'Snitt', klasse: 'linjenokkel snitt' }]} />
      </Grafkort>
    </>
  )
}

function Volumtips({ p, snitt, snittLengde, enhet }: { p: Punkt; snitt: number; snittLengde: number; enhet: string }) {
  return (
    <>
      <b>{p.etikett}</b>
      <span className="tips-tall">
        {timer(p.sum.minutter)} t · {km(p.sum.km)} km · {p.sum.okter} økter
      </span>
      {SONER.filter((s) => p.sum.sone[s] > 0).map((s) => (
        <span key={s} className="tips-rad">
          <i className={`seg-${s.toLowerCase()}`} />
          {s} {timer(p.sum.sone[s])}
        </span>
      ))}
      {p.sum.styrke > 0 && (
        <span className="tips-rad">
          <i className="seg-styrke" />
          Styrke {timer(p.sum.styrke)}
        </span>
      )}
      <span className="tips-rad dempet">
        Snitt {snittLengde} {enhet === 'uke' ? 'uker' : 'mnd.'}: {timer(snitt * 60)} t
      </span>
      {(p.syk > 0 || p.skadet > 0) && (
        <span className="tips-rad varsel">
          {[p.syk && `${p.syk} ${p.syk === 1 ? 'syk dag' : 'syke dager'}`, p.skadet && `${p.skadet} ${p.skadet === 1 ? 'skadedag' : 'skadedager'}`]
            .filter(Boolean)
            .join(' og ')}
        </span>
      )}
    </>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sesongKort = (iso: string) => `${iso.slice(2, 4)}/${String(+iso.slice(2, 4) + 1).padStart(2, '0')}`

