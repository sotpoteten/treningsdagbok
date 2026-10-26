import { Maximize2, Minimize2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { bevegelsestid, glidendeMedian } from '../data/bevegelsestid'
import { bevegelsesfart, fartsdomene, tempomerker, tilFart, tilMinPerKm } from '../data/fartsakse'
import { km, tempo, varighetLang } from '../data/format'
import { harSporfil } from '../data/last'
import type { GarminAktivitet, GarminSpor } from '../data/typer'
import { Segment } from './graf/felles'
import { iNorge, midtpunkt } from './kart/omrade'
import { Tidsserie } from './graf/Tidsserie'
import type { Kartlag } from './kart/Kart'

const Kart = lazy(() => import('./kart/Kart'))

const TYPENAVN: Record<string, string> = {
  running: 'Løping',
  treadmill_running: 'Mølle',
  trail_running: 'Terrengløp',
  indoor_running: 'Innendørs løp',
  track_running: 'Bane',
  cycling: 'Sykkel',
  indoor_cycling: 'Innesykkel',
  virtual_ride: 'Innesykkel',
  strength_training: 'Styrke',
  cross_country_skiing_ws: 'Langrenn',
  skate_skiing_ws: 'Skøyting',
  multi_sport: 'Multisport',
  elliptical: 'Ellipse',
}
const typenavn = (t: string) => TYPENAVN[t] ?? t.replace(/_/g, ' ')

/** «m:ss» eller «t:mm:ss» for sekunder. */
function klokke(sekunder: number) {
  // Rund av til hele sekunder først, så 59,6 s blir «1:00» og ikke «0:60».
  const s = Math.round(sekunder)
  const t = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sek = s % 60
  const mm = t ? String(m).padStart(2, '0') : String(m)
  return `${t ? `${t}:` : ''}${mm}:${String(sek).padStart(2, '0')}`
}

/** Merker for tid i bevegelse: «m:ss» under en time, ellers «t:mm». */
function tidsmerker([fra, til]: [number, number]) {
  const lengde = til - fra
  const steg = [300, 600, 900, 1800, 3600, 7200].find((s) => lengde / s <= 6) ?? 7200
  const timer = til >= 3600
  const ut = []
  for (let s = Math.ceil(fra / steg) * steg; s <= til; s += steg) {
    const m = Math.round(s / 60)
    ut.push({ x: s, etikett: timer ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m}:00` })
  }
  return ut
}

/** m/s → min/km, eller null når farten er så lav at det er stopp. */
const minPerKm = (v: number | null) => {
  const f = bevegelsesfart(v)
  return f != null ? tilMinPerKm(f) : null
}

/**
 * Tilstand som starter på nytt når `nokkel` endres. Nullstillingen skjer under rendringen,
 * slik React anbefaler, i stedet for i en effekt som gir en ekstra rendring.
 */
function useTilstandPer<V>(nokkel: unknown, start: V) {
  const [lagret, setLagret] = useState({ nokkel, verdi: start })
  const ny = !Object.is(lagret.nokkel, nokkel)
  if (ny) setLagret({ nokkel, verdi: start })
  const sett = useCallback((v: V) => setLagret({ nokkel, verdi: v }), [nokkel])
  return [ny ? start : lagret.verdi, sett] as const
}

interface Props {
  aktiviteter: GarminAktivitet[]
  /** Sporfilene som finnes; null betyr at lista mangler, og da prøver vi alle. */
  sporFinnes: Set<number> | null
}

export function Garminokt({ aktiviteter, sporFinnes }: Props) {
  // Ny økt gir første aktivitet; valgt kart og aktivt punkt gjelder bare én aktivitet.
  const [valgt, setValgt] = useTilstandPer(aktiviteter, 0)
  const a = aktiviteter[Math.min(valgt, aktiviteter.length - 1)]
  const [aktiv, setAktiv] = useTilstandPer<number | null>(a.garmin_id, null)
  // Null til Isak velger selv: da avgjør sporet om det er Kartverket (Norge) eller OSM.
  const [lagValg, setLagValg] = useTilstandPer<Kartlag | null>(a.garmin_id, null)
  const [stor, setStor] = useState(false)

  // Sporfilene ligger ikke i repoet. Den publiserte siden har dem bare når utgivelsen «spor»
  // finnes; lista sporFinnes sier hvilke som er med.
  // Uten GPS (mølle, innendørs) har sporfila bare puls, og den hentes for pulskurven.
  const kanHente = harSporfil(sporFinnes, a)
  const [hentet, setHentet] = useState<{ id: number; spor: GarminSpor | null } | null>(null)
  const ferdig = hentet?.id === a.garmin_id
  const spor = kanHente && ferdig ? hentet.spor : null
  const laster = kanHente && !ferdig

  useEffect(() => {
    if (!kanHente) return
    let avbrutt = false
    const id = a.garmin_id
    fetch(`${import.meta.env.BASE_URL}garmin_spor/${id}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((s: GarminSpor | null) => {
        if (!avbrutt) setHentet({ id, spor: s && s.punkter ? s : null })
      })
    return () => {
      avbrutt = true
    }
  }, [a.garmin_id, kanHente])

  useEffect(() => {
    if (!stor) return
    const tast = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setStor(false))
    window.addEventListener('keydown', tast, true)
    return () => window.removeEventListener('keydown', tast, true)
  }, [stor])

  const p = spor?.punkter
  // Uten GPS er klokkas distanse og fart for upresise: ingen tempokurve, og runder uten km og tempo.
  const gps = a.har_spor
  // Pausene på klokka tas ut av tidsaksen; x er tid i bevegelse, med samme indeks som sporet.
  const bev = useMemo(() => (p ? bevegelsestid(p.t) : null), [p])
  const brudd = useMemo(() => bev?.pauser.map((q) => q.indeks) ?? [], [bev])
  // Farten glattes over 7 punkter (ca. 35 s) i bevegelse, aldri over en pause. Stillstand og
  // fart utenfor aksen blir hull i stedet for loddrette vegger.
  const { fartserie, fartsakse } = useMemo(() => {
    const f = gps && p?.fart ? glidendeMedian(p.fart.map(bevegelsesfart), 7, brudd) : null
    if (!f) return { fartserie: null, fartsakse: [tilFart(7), tilFart(3)] as [number, number] }
    const akse = fartsdomene(f)
    return { fartserie: f.map((v) => (v != null && v >= akse[0] && v <= akse[1] ? v : null)), fartsakse: akse }
  }, [p, brudd, gps])
  const tempoMerker = useMemo(() => tempomerker(fartsakse).map(tilFart), [fartsakse])
  // Puls glattes over 3 punkter (ca. 15 s), heller ikke over en pause.
  const pulsserie = useMemo(() => (p?.puls ? glidendeMedian(p.puls, 3, brudd) : null), [p, brudd])
  // Rundegrensene står i klokketid og regnes om til tid i bevegelse.
  const rundelinjer = useMemo(
    () => (bev && spor && spor.runder.length > 1 ? spor.runder.slice(1).map((r) => bev.tilBevegelse(r.start_s)) : undefined),
    [bev, spor],
  )
  const tempoTekst = (i: number) => (fartserie?.[i] != null ? `${tempo(tilMinPerKm(fartserie[i]!))} /km` : null)
  const rundetempoMedian = useMemo(() => {
    const v = (spor?.runder ?? [])
      .map((r) => minPerKm(r.fart ?? (r.dist_m && r.tid_s ? r.dist_m / r.tid_s : null)))
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : null
  }, [spor])
  const harKart = !!(p?.lat && p.lon && p.lat.some((v) => v != null))
  const midt = useMemo(() => (p?.lat && p.lon ? midtpunkt(p.lat, p.lon) : null), [p])
  const lag: Kartlag = lagValg ?? (midt && !iNorge(...midt) ? 'osm' : 'topo')
  const erLop = (a.distanse_km ?? 0) > 0 && /running|run/.test(a.type)

  return (
    <section className="panel-del garmin">
      <h3>Garmin</h3>
      {aktiviteter.length > 1 && (
        <div className="garmin-valg" role="group" aria-label="Velg aktivitet">
          {aktiviteter.map((x, i) => (
            <button key={x.garmin_id} type="button" aria-pressed={i === valgt} onClick={() => setValgt(i)}>
              <b>{x.start_lokal.slice(11, 16)}</b> {typenavn(x.type)} · {varighetLang(Math.round(x.varighet_min))}
            </button>
          ))}
        </div>
      )}

      <dl className="nokkeltall">
        <div>
          <dt>Snittpuls</dt>
          <dd>{a.snittpuls ?? '–'}</dd>
        </div>
        <div>
          <dt>Makspuls</dt>
          <dd>{a.makspuls ?? '–'}</dd>
        </div>
        <div>
          <dt>{erLop ? 'Distanse' : 'Type'}</dt>
          <dd>{erLop ? `${km(a.distanse_km)} km` : typenavn(a.type)}</dd>
        </div>
        <div>
          <dt>Høydemeter</dt>
          <dd>{a.hoydemeter ?? '–'}</dd>
        </div>
        <div>
          <dt>Treningseffekt aerob/anaerob</dt>
          <dd>{a.aerob_te != null ? `${String(a.aerob_te).replace('.', ',')} / ${String(a.anaerob_te ?? 0).replace('.', ',')}` : '–'}</dd>
        </div>
        <div>
          <dt>Belastning</dt>
          <dd>{a.belastning ?? '–'}</dd>
        </div>
      </dl>

      {laster && <p className="fotnote">Laster spor …</p>}
      {!laster && !spor && (
        <p className="fotnote">
          {!a.har_spor && !a.har_kurver
            ? 'GPS-spor og kurver er ikke tilgjengelige for denne økta.'
            : !kanHente
              ? // Aktiviteten har spor eller puls, men sporfila finnes ikke her.
                a.har_spor
                ? 'GPS-sporet mangler for denne økta.'
                : 'Pulskurven mangler for denne økta.'
              : a.har_spor
                ? 'GPS-sporet kunne ikke lastes.'
                : 'Pulskurven kunne ikke lastes.'}
        </p>
      )}
      {spor && !gps && (
        <p className="fotnote">Uten GPS er ikke klokkas distanse og fart presise nok til å vises. Farten står ofte i dagboknotatet.</p>
      )}

      {harKart && p && (
        <div className={stor ? 'kartramme stor' : 'kartramme'}>
          <div className="kartvalg">
            <Segment
              etikett="Kart"
              verdi={lag}
              onEndre={setLagValg}
              valg={[
                { id: 'topo', navn: 'Topo' },
                { id: 'osm', navn: 'OSM' },
              ]}
            />
            <button type="button" className="ikonknapp" onClick={() => setStor(!stor)} aria-label={stor ? 'Lukk stort kart (Esc)' : 'Vis stort kart'}>
              {stor ? <Minimize2 /> : <Maximize2 />}
            </button>
          </div>
          <Suspense fallback={<div className="kart kart-laster">Laster kart …</div>}>
            <Kart key={stor ? 'stor' : 'liten'} lat={p.lat!} lon={p.lon!} lag={lag} aktiv={aktiv} onAktiv={setAktiv} />
          </Suspense>
        </div>
      )}

      {bev && ((pulsserie && pulsserie.some((v) => v != null)) || (erLop && fartserie && fartserie.some((v) => v != null))) && (
        <p className="fotnote kurveforklaring">
          Kurvene viser tid i bevegelse.
          {bev.pauser.length > 0 &&
            ` ${bev.pauser.length === 1 ? 'Én pause' : `${bev.pauser.length} pauser`} på klokka er tatt ut (${klokke(bev.tattUt_s)}).`}
        </p>
      )}

      {pulsserie && pulsserie.some((v) => v != null) && p && bev && (
        <>
          <h4 className="kurvetittel">Puls (slag/min)</h4>
          <Tidsserie
            x={bev.x}
            serier={[{ id: 'puls', navn: 'Puls', verdier: pulsserie, klasse: 'ts-puls', form: 'linje' }]}
            hoyde={150}
            brudd={brudd}
            xLinjer={rundelinjer}
            xMerker={tidsmerker}
            yFormat={(v) => `${v}`}
            aktiv={aktiv}
            onAktiv={setAktiv}
            beskrivelse="Puls gjennom økta, mot tid i bevegelse"
            tips={(i) => (
              <>
                <b>{klokke(bev.x[i])}</b>
                <span className="tips-tall">{p.puls?.[i] ?? '–'} slag/min</span>
                {tempoTekst(i) && <span className="tips-rad">{tempoTekst(i)}</span>}
                {gps && p.dist?.[i] != null && <span className="tips-rad dempet">{km(p.dist[i]! / 1000)} km</span>}
              </>
            )}
          />
        </>
      )}

      {erLop && fartserie && fartserie.some((v) => v != null) && p && bev && (
        <>
          <h4 className="kurvetittel">Tempo (min/km)</h4>
          <Tidsserie
            x={bev.x}
            serier={[{ id: 'tempo', navn: 'Tempo', verdier: fartserie, klasse: 'ts-tempo', form: 'linje' }]}
            hoyde={150}
            yDomene={fartsakse}
            yMerker={tempoMerker}
            brudd={brudd}
            xLinjer={rundelinjer}
            xMerker={tidsmerker}
            yFormat={(v) => tempo(tilMinPerKm(v))}
            aktiv={aktiv}
            onAktiv={setAktiv}
            beskrivelse="Tempo i min/km gjennom økta, mot tid i bevegelse. Raskere er høyere"
            tips={(i) => (
              <>
                <b>{klokke(bev.x[i])}</b>
                <span className="tips-tall">{tempoTekst(i) ?? 'stopp'}</span>
                {p.puls?.[i] != null && <span className="tips-rad">{p.puls[i]} slag/min</span>}
              </>
            )}
          />
        </>
      )}

      {spor && spor.runder.length > 1 && (
        <p className="fotnote">
          {gps && 'Runder i grått er pauser eller rolige drag. '}De tynne loddrette strekene i kurvene er rundegrensene.
        </p>
      )}
      {spor && spor.runder.length > 1 && (
        <table className="blokktabell runder">
          <thead>
            <tr>
              <th scope="col">Runde</th>
              <th scope="col">Tid</th>
              {gps && <th scope="col">Km</th>}
              {gps && <th scope="col">Tempo</th>}
              <th scope="col">Puls (maks)</th>
            </tr>
          </thead>
          <tbody>
            {spor.runder.map((r, i) => {
              // Noen klokker lagrer ikke snittfart per runde; regn den ut fra distanse og tid.
              const tp = minPerKm(r.fart ?? (r.dist_m && r.tid_s ? r.dist_m / r.tid_s : null))
              // Uten GPS er distanse og fart for usikre til å si hvilke runder som er hvile.
              const hvile = gps && erHvilerunde(r, tp, rundetempoMedian)
              return (
                <tr key={i} className={hvile ? 'hvile' : undefined} onMouseEnter={() => setAktiv(nermesteIndeks(p!.t, r.start_s + r.tid_s / 2))} onMouseLeave={() => setAktiv(null)}>
                  <td>{i + 1}</td>
                  <td>{klokke(r.tid_s)}</td>
                  {gps && <td>{r.dist_m ? km(r.dist_m / 1000) : ''}</td>}
                  {gps && <td>{erLop && tp ? tempo(tp) : ''}</td>}
                  <td>
                    {r.puls ?? ''}
                    {r.makspuls ? <span className="dempet-tall"> ({r.makspuls})</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="fotnote">
        Garmin: {typenavn(a.type)} kl. {a.start_lokal.slice(11, 16)}, {varighetLang(Math.round(a.varighet_min))}.
      </p>
    </section>
  )
}

/** Pause eller rolig drag: nesten ingen distanse, eller mye tregere enn midtrunden. */
function erHvilerunde(r: { dist_m: number | null }, tempo: number | null, median: number | null) {
  if (r.dist_m != null && r.dist_m <= 100) return true
  return tempo != null && median != null && tempo > median * 1.4
}

function nermesteIndeks(t: number[], s: number) {
  let beste = 0
  for (let i = 0; i < t.length; i++) if (Math.abs(t[i] - s) < Math.abs(t[beste] - s)) beste = i
  return beste
}
