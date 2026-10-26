import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { dato, km, tall, timer, ukespenn } from '../../data/format'
import { AKUTT_DAGER, HRV_VINDU, KRONISK_DAGER } from '../../data/helse'
import { dagserie, glidendeSnittMedHull, snitt, ukepunkter } from '../../data/statistikk'
import type { GarminDag } from '../../data/typer'
import { Grafkort, Segment, Tegnforklaring } from '../../komponenter/graf/felles'
import { Stolper } from '../../komponenter/graf/Stolper'
import { Tidsserie } from '../../komponenter/graf/Tidsserie'
import { useUrlTilstand } from '../../komponenter/useUrlTilstand'
import type { Analysekontekst } from '../Analyse'
import { SykeOgSkade } from './Rekorder'

const PERIODER = ['sesong', 'alle'] as const
type Periode = (typeof PERIODER)[number]
const SNITT_DAGER = 7
const en = (v: number | null | undefined, d = 0) => (v == null ? '–' : v.toLocaleString('nb-NO', { maximumFractionDigits: d }))

export function Helse({ k }: { k: Analysekontekst }) {
  const [periode, setPeriode] = useUrlTilstand<Periode>('periode', 'sesong', PERIODER)
  const navigate = useNavigate()
  const helse = k.dagbok.helsePerDato

  if (!k.dagbok.helse.length) {
    return (
      <section className="analyse-del">
        <h1>Helse og belastning</h1>
        <p className="ingress">
          Fant ingen Garmin-data. Legg eksporten i <code>data/raw/garmin/</code>, kjør{' '}
          <code>.venv\Scripts\python scripts/konverter_garmin.py</code> og start siden på nytt.
        </p>
        <SykeOgSkade k={k} />
      </section>
    )
  }

  const fra = periode === 'sesong' ? k.valgt.fra : k.sesonger[0].fra
  const til =
    periode === 'alle' ? k.dagbok.sisteDato : k.valgt.til < k.sluttdato ? k.valgt.til : k.sluttdato

  return (
    <HelseInnhold
      k={k}
      fra={fra}
      til={til}
      helse={helse}
      periodevalg={
        <Segment
          etikett="Periode"
          verdi={periode}
          onEndre={setPeriode}
          valg={[
            { id: 'sesong', navn: k.valgt.navn },
            { id: 'alle', navn: 'Alle sesonger' },
          ]}
        />
      }
      apneUke={(uke) => navigate(`/?uke=${uke}`)}
    />
  )
}

function HelseInnhold({
  k,
  fra,
  til,
  helse,
  periodevalg,
  apneUke,
}: {
  k: Analysekontekst
  fra: string
  til: string
  helse: Map<string, GarminDag>
  periodevalg: ReactNode
  apneUke: (uke: string) => void
}) {
  const serier = useMemo(() => {
    const s = (f: (d: GarminDag) => number | null | undefined) => dagserie(helse, fra, til, f)
    const hvilepuls = s((d) => d.hvilepuls)
    const hrv = s((d) => d.hrv_natt)
    const datoer = hvilepuls.datoer
    const merker: { indeks: number; klasse: string }[] = []
    datoer.forEach((d, i) => {
      const r = k.dagbok.dagerPerDato.get(d)
      if (r?.syk) merker.push({ indeks: i, klasse: 'm-syk' })
      else if (r?.skadet) merker.push({ indeks: i, klasse: 'm-skadet' })
    })
    return {
      datoer,
      x: datoer.map((_, i) => i),
      merker,
      hvilepuls: hvilepuls.verdier,
      hvilepulsSnitt: glidendeSnittMedHull(hvilepuls.verdier, SNITT_DAGER),
      hrv: hrv.verdier,
      hrvSnitt: glidendeSnittMedHull(hrv.verdier, SNITT_DAGER),
      hrvLav: s((d) => d.hrv_normal_lav).verdier,
      hrvHoy: s((d) => d.hrv_normal_hoy).verdier,
      score: s((d) => d.sovnscore).verdier,
      akutt: s((d) => d.belastning_akutt).verdier,
      kronisk: s((d) => d.belastning_kronisk).verdier,
      acwr: s((d) => d.acwr).verdier,
    }
  }, [helse, fra, til, k.dagbok])

  const uker = useMemo(
    () =>
      ukepunkter(k.dagbok.uker)
        .filter((p) => p.uke.dager[3].dato >= fra && p.uke.mandag <= til)
        .map((p) => {
          const dager = p.uke.dager.map((d) => helse.get(d.dato)).filter((d): d is GarminDag => !!d)
          return {
            p,
            hvilepuls: snitt(dager.map((d) => d.hvilepuls)),
            hrv: snitt(dager.map((d) => d.hrv_natt)),
            sovn: snitt(dager.map((d) => d.sovn_min)),
            score: snitt(dager.map((d) => d.sovnscore)),
            akutt: snitt(dager.map((d) => d.belastning_akutt)),
          }
        }),
    [k.dagbok, helse, fra, til],
  )

  const { datoer, x } = serier
  const alle = datoer.length > 400
  const xMerker = () =>
    datoer.flatMap((d, i) =>
      d.endsWith('-01') && (!alle || d.slice(5, 7) === '11')
        ? [{ x: i, etikett: alle ? `${d.slice(2, 4)}/${String(+d.slice(2, 4) + 1).padStart(2, '0')}` : dato(d, 'MMM').replace('.', '') }]
        : [],
    )
  const datotips = (i: number) => <b>{dato(datoer[i], 'EEEE d. MMMM yyyy')}</b>
  const harHrv = serier.hrv.some((v) => v != null)
  const harBelastning = serier.akutt.some((v) => v != null)

  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Uke</th>
          <th scope="col">Timer</th>
          <th scope="col">Km</th>
          <th scope="col">Hvilepuls</th>
          <th scope="col">HRV</th>
          <th scope="col">Søvn</th>
          <th scope="col">Søvnscore</th>
          <th scope="col">Akutt belastning</th>
        </tr>
      </thead>
      <tbody>
        {[...uker].reverse().map((u) => (
          <tr key={u.p.uke.nokkel}>
            <th scope="row">
              <Link to={`/?uke=${u.p.uke.nokkel}`}>
                Uke {u.p.uke.uke} · {ukespenn(u.p.uke.mandag, u.p.uke.sondag)}
              </Link>
            </th>
            <td>{timer(u.p.sum.minutter)}</td>
            <td>{km(u.p.sum.km)}</td>
            <td>{en(u.hvilepuls, 1)}</td>
            <td>{en(u.hrv)}</td>
            <td>{u.sovn != null ? timer(u.sovn) : '–'}</td>
            <td>{en(u.score)}</td>
            <td>{en(u.akutt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const sykForklaring = 'Loddrette streker markerer syke og skadde dager.'
  const helseTabell = 'Snitt per uke for hvilepuls, HRV, søvn og akutt belastning, med ukas timer og km, nyeste uke først. Tabellen er den samme for alle grafene på siden. Klikk en uke for å åpne den i dagboka.'

  return (
    <div className="helse-nokler">
      <div className="del-hode">
        <h1>Helse og belastning</h1>
        {periodevalg}
      </div>

      <Grafkort id="hvilepuls" tittel="Hvilepuls" forklaring={`Slag/min hver morgen, med snitt over ${SNITT_DAGER} dager. ${sykForklaring}`} forklaringTabell={helseTabell} tabell={tabell}>
        <Tidsserie
          x={x}
          serier={[
            { id: 'p', navn: 'Hvilepuls', verdier: serier.hvilepuls, klasse: 'ts-hoved', form: 'punkt' },
            { id: 's', navn: `Snitt ${SNITT_DAGER} dager`, verdier: serier.hvilepulsSnitt, klasse: 'ts-snitt', form: 'linje' },
          ]}
          markorer={serier.merker}
          xMerker={xMerker}
          yFormat={(v) => `${v}`}
          beskrivelse="Hvilepuls per dag med glidende snitt"
          tips={(i) => (
            <>
              {datotips(i)}
              <span className="tips-tall">{serier.hvilepuls[i] ?? '–'} slag/min</span>
              <span className="tips-rad dempet">Snitt {SNITT_DAGER} dager: {en(serier.hvilepulsSnitt[i], 1)}</span>
            </>
          )}
        />
        <Tegnforklaring
          serier={[
            { id: 'p', navn: 'Per dag', klasse: 'prikk-hoved' },
            { id: 's', navn: `Snitt ${SNITT_DAGER} dager`, klasse: 'linjenokkel snitt' },
            ...SYK_NOKLER,
          ]}
        />
      </Grafkort>

      <Grafkort
        id="hrv"
        tittel="HRV om natta"
        forklaring={
          harHrv
            ? `Snitt-HRV (ms) per natt. Det grå båndet er normalområdet: snittet ± ett standardavvik av de ${HRV_VINDU} foregående nettene, regnet på samme måte for hele dagboka. ${sykForklaring}`
            : 'HRV finnes fra høsten 2023 (Forerunner 255). Velg en senere sesong.'
        }
        forklaringTabell={harHrv ? helseTabell : undefined}
        tabell={tabell}
      >
        {harHrv && (
          <>
            <Tidsserie
              x={x}
              serier={[
                { id: 'p', navn: 'HRV', verdier: serier.hrv, klasse: 'ts-hoved', form: 'punkt' },
                { id: 's', navn: `Snitt ${SNITT_DAGER} dager`, verdier: serier.hrvSnitt, klasse: 'ts-snitt', form: 'linje' },
              ]}
              band={{ lav: serier.hrvLav, hoy: serier.hrvHoy, navn: 'Normalområde' }}
              markorer={serier.merker}
              xMerker={xMerker}
              yFormat={(v) => `${v}`}
              beskrivelse="HRV per natt med normalområde og glidende snitt"
              tips={(i) => (
                <>
                  {datotips(i)}
                  <span className="tips-tall">{serier.hrv[i] ?? '–'} ms</span>
                  <span className="tips-rad dempet">Snitt {SNITT_DAGER} dager: {en(serier.hrvSnitt[i])}</span>
                  {serier.hrvLav[i] != null && (
                    <span className="tips-rad dempet">
                      Normal {serier.hrvLav[i]}–{serier.hrvHoy[i]}
                    </span>
                  )}
                </>
              )}
            />
            <Tegnforklaring
              serier={[
                { id: 'p', navn: 'Per natt', klasse: 'prikk-hoved' },
                { id: 's', navn: `Snitt ${SNITT_DAGER} dager`, klasse: 'linjenokkel snitt' },
                { id: 'b', navn: 'Normalområde', klasse: 'band-nokkel' },
                ...SYK_NOKLER,
              ]}
            />
          </>
        )}
      </Grafkort>

      <Grafkort id="sovn" tittel="Søvn per natt, snitt per uke" forklaring="Timer søvn. Søvnscore finnes fra ca. 2023. Klikk en uke for å åpne den." forklaringTabell={helseTabell} tabell={tabell}>
        <Stolper
          punkter={uker.map((u) => ({ nokkel: u.p.uke.nokkel, verdier: { sovn: (u.sovn ?? 0) / 60 } }))}
          serier={[{ id: 'sovn', navn: 'Søvn', klasse: 'fyll-sovn' }]}
          hoyde={220}
          yFormat={(v) => `${v} t`}
          xEtikett={(_, i) => {
            const t = uker[i].p.uke.dager[3].dato
            const f = i > 0 ? uker[i - 1].p.uke.dager[3].dato : ''
            return t.slice(5, 7) !== f.slice(5, 7) ? dato(t, alle ? 'MMM yy' : 'MMM').replace('.', '') : null
          }}
          beskrivelse="Søvn per natt i snitt per uke"
          onKlikk={(p) => apneUke(p.nokkel)}
          tips={(_, i) => {
            const u = uker[i]
            return (
              <>
                <b>
                  Uke {u.p.uke.uke} · {ukespenn(u.p.uke.mandag, u.p.uke.sondag)}
                </b>
                <span className="tips-tall">{u.sovn != null ? `${timer(u.sovn)} t søvn per natt` : 'Ingen søvndata'}</span>
                {u.score != null && <span className="tips-rad dempet">Søvnscore {en(u.score)}</span>}
              </>
            )
          }}
        />
        {serier.score.some((v) => v != null) && (
          <>
            <h3 className="grafkort-undertittel">Søvnscore</h3>
            <Tidsserie
              x={x}
              serier={[
                { id: 'p', navn: 'Søvnscore', verdier: serier.score, klasse: 'ts-hoved', form: 'punkt' },
                { id: 's', navn: `Snitt ${SNITT_DAGER} dager`, verdier: glidendeSnittMedHull(serier.score, SNITT_DAGER), klasse: 'ts-snitt', form: 'linje' },
              ]}
              hoyde={150}
              yDomene={[30, 100]}
              xMerker={xMerker}
              yFormat={(v) => `${v}`}
              beskrivelse="Søvnscore per natt"
              tips={(i) => (
                <>
                  {datotips(i)}
                  <span className="tips-tall">Score {serier.score[i] ?? '–'}</span>
                </>
              )}
            />
            <Tegnforklaring
              serier={[
                { id: 'p', navn: 'Per natt', klasse: 'prikk-hoved' },
                { id: 's', navn: `Snitt ${SNITT_DAGER} dager`, klasse: 'linjenokkel snitt' },
              ]}
            />
          </>
        )}
      </Grafkort>

      <Grafkort
        id="belastning"
        tittel="Treningsbelastning"
        forklaring={
          harBelastning
            ? `Ut fra klokkas belastning per økt: akutt er summen de siste ${AKUTT_DAGER} dagene, kronisk er snittet per uke de siste ${KRONISK_DAGER / 7} ukene. Under: ACWR, forholdet mellom dem, med området 0,8–1,3 som ofte regnes som trygt (Gabbett 2016), og ukas timer fra dagboka.`
            : 'Belastning finnes fra august 2023. Velg en senere sesong.'
        }
        forklaringTabell={harBelastning ? helseTabell : undefined}
        tabell={tabell}
      >
        {harBelastning && (
          <>
            <Tidsserie
              x={x}
              serier={[
                { id: 'k', navn: 'Kronisk', verdier: serier.kronisk, klasse: 'ts-dempet', form: 'linje' },
                { id: 'a', navn: 'Akutt', verdier: serier.akutt, klasse: 'ts-hoved', form: 'linje' },
              ]}
              xMerker={xMerker}
              yFormat={(v) => `${v}`}
              beskrivelse="Akutt og kronisk treningsbelastning"
              tips={(i) => (
                <>
                  {datotips(i)}
                  <span className="tips-rad">
                    <i className="linjenokkel" />
                    Akutt <span className="tips-verdi">{en(serier.akutt[i])}</span>
                  </span>
                  <span className="tips-rad dempet">
                    <i className="linjenokkel vekt-bakgrunn" />
                    Kronisk <span className="tips-verdi">{en(serier.kronisk[i])}</span>
                  </span>
                </>
              )}
            />
            <Tegnforklaring
              serier={[
                { id: 'a', navn: 'Akutt', klasse: 'linjenokkel' },
                { id: 'k', navn: 'Kronisk', klasse: 'linjenokkel vekt-bakgrunn' },
              ]}
            />
            <h3 className="grafkort-undertittel">ACWR (akutt / kronisk)</h3>
            <Tidsserie
              x={x}
              serier={[{ id: 'r', navn: 'ACWR', verdier: serier.acwr, klasse: 'ts-hoved', form: 'linje' }]}
              band={{ lav: x.map(() => 0.8), hoy: x.map(() => 1.3), navn: 'Optimalt' }}
              hoyde={140}
              yDomene={[0, 2]}
              xMerker={xMerker}
              yFormat={(v) => v.toLocaleString('nb-NO')}
              beskrivelse="Forholdet mellom akutt og kronisk belastning"
              tips={(i) => (
                <>
                  {datotips(i)}
                  <span className="tips-tall">ACWR {en(serier.acwr[i], 2)}</span>
                </>
              )}
            />
            <h3 className="grafkort-undertittel">Timer per uke i dagboka</h3>
            <Stolper
              punkter={uker.map((u) => ({ nokkel: u.p.uke.nokkel, verdier: { t: u.p.sum.minutter / 60 } }))}
              serier={[{ id: 't', navn: 'Timer', klasse: 'fyll-volum' }]}
              hoyde={140}
              yFormat={(v) => `${v} t`}
              xEtikett={() => null}
              beskrivelse="Timer per uke fra dagboka"
              onKlikk={(p) => apneUke(p.nokkel)}
              tips={(_, i) => (
                <>
                  <b>
                    Uke {uker[i].p.uke.uke} · {ukespenn(uker[i].p.uke.mandag, uker[i].p.uke.sondag)}
                  </b>
                  <span className="tips-tall">
                    {timer(uker[i].p.sum.minutter)} t · {tall(uker[i].p.sum.okter)} økter
                  </span>
                  <span className="tips-rad dempet">Akutt belastning (snitt) {en(uker[i].akutt)}</span>
                </>
              )}
            />
          </>
        )}
      </Grafkort>

      <SykeOgSkade k={k} />
    </div>
  )
}

const SYK_NOKLER = [
  { id: 'syk', navn: 'Syk', klasse: 'fyll-syk' },
  { id: 'skadet', navn: 'Skadet', klasse: 'fyll-skadet' },
]

