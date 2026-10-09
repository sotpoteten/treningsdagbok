import { Maximize2, Minimize2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { km, tempo, varighetLang } from '../data/format'
import type { GarminAktivitet, GarminSpor } from '../data/typer'
import { Segment } from './graf/felles'
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
export const typenavn = (t: string) => TYPENAVN[t] ?? t.replace(/_/g, ' ')

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

function tidsmerker([fra, til]: [number, number]) {
  const lengde = til - fra
  const steg = [300, 600, 900, 1800, 3600, 7200].find((s) => lengde / s <= 6) ?? 7200
  const ut = []
  for (let s = Math.ceil(fra / steg) * steg; s <= til; s += steg) ut.push({ x: s, etikett: s ? `${Math.round(s / 60)}′` : '0' })
  return ut
}

/** m/s → min/km, eller null når farten er så lav at det er stopp. */
const minPerKm = (v: number | null) => (v != null && v > 0.8 ? 1000 / 60 / v : null)

/**
 * Glidende median over `n` punkter (oddetall), så GPS-støy ikke skjuler forløpet.
 * Puls bruker 3 punkter (ca. 15 s), tempo 7 (ca. 35 s), siden GPS-farten er mer støyete.
 */
function median(v: (number | null)[], n: number): (number | null)[] {
  const h = (n - 1) / 2
  return v.map((x, i) => {
    if (x == null) return null
    const vindu = v.slice(Math.max(0, i - h), i + h + 1).filter((y): y is number => y != null)
    vindu.sort((a, b) => a - b)
    return vindu[Math.floor(vindu.length / 2)]
  })
}

export function Garminokt({ aktiviteter }: { aktiviteter: GarminAktivitet[] }) {
  const [valgt, setValgt] = useState(0)
  const a = aktiviteter[Math.min(valgt, aktiviteter.length - 1)]
  const [spor, setSpor] = useState<GarminSpor | null>(null)
  const [laster, setLaster] = useState(false)
  const [aktiv, setAktiv] = useState<number | null>(null)
  const [lag, setLag] = useState<Kartlag>('topo')
  const [stor, setStor] = useState(false)

  useEffect(() => setValgt(0), [aktiviteter])

  useEffect(() => {
    let avbrutt = false
    setSpor(null)
    setAktiv(null)
    setLaster(true)
    fetch(`${import.meta.env.BASE_URL}garmin_spor/${a.garmin_id}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((s: GarminSpor | null) => {
        if (!avbrutt) {
          setSpor(s && s.punkter ? s : null)
          setLaster(false)
        }
      })
    return () => {
      avbrutt = true
    }
  }, [a.garmin_id])

  useEffect(() => {
    if (!stor) return
    const tast = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setStor(false))
    window.addEventListener('keydown', tast, true)
    return () => window.removeEventListener('keydown', tast, true)
  }, [stor])

  const p = spor?.punkter
  // Tempo og puls glattes litt; tempo utenfor aksen blir hull i stedet for loddrette vegger.
  const { temposerie, tempoakse } = useMemo(() => {
    const t = p?.fart ? median(p.fart.map(minPerKm), 7) : null
    if (!t) return { temposerie: null, tempoakse: [3, 7] as [number, number] }
    const akse = tempodomene(t)
    return { temposerie: t.map((v) => (v != null && v >= akse[0] && v <= akse[1] ? v : null)), tempoakse: akse }
  }, [p])
  const pulsserie = useMemo(() => (p?.puls ? median(p.puls, 3) : null), [p])
  const rundetempoMedian = useMemo(() => {
    const v = (spor?.runder ?? [])
      .map((r) => minPerKm(r.fart ?? (r.dist_m && r.tid_s ? r.dist_m / r.tid_s : null)))
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : null
  }, [spor])
  const harKart = !!(p?.lat && p.lon && p.lat.some((v) => v != null))
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
      {!laster && !spor && <p className="fotnote">GPS-spor og kurver er ikke tilgjengelige for denne økta.</p>}

      {harKart && p && (
        <div className={stor ? 'kartramme stor' : 'kartramme'}>
          <div className="kartvalg">
            <Segment
              etikett="Kart"
              verdi={lag}
              onEndre={setLag}
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

      {pulsserie && pulsserie.some((v) => v != null) && p && (
        <>
          <h4 className="kurvetittel">Puls (slag/min)</h4>
          <Tidsserie
            x={p.t}
            serier={[{ id: 'puls', navn: 'Puls', verdier: pulsserie, klasse: 'ts-puls', form: 'linje' }]}
            hoyde={150}
            xMerker={tidsmerker}
            yFormat={(v) => `${v}`}
            aktiv={aktiv}
            onAktiv={setAktiv}
            beskrivelse="Puls gjennom økta"
            tips={(i) => (
              <>
                <b>{klokke(p.t[i])}</b>
                <span className="tips-tall">{p.puls?.[i] ?? '–'} slag/min</span>
                {temposerie?.[i] != null && <span className="tips-rad">{tempo(temposerie[i]!)} /km</span>}
                {p.dist?.[i] != null && <span className="tips-rad dempet">{km(p.dist[i]! / 1000)} km</span>}
              </>
            )}
          />
        </>
      )}

      {erLop && temposerie && temposerie.some((v) => v != null) && p && (
        <>
          <h4 className="kurvetittel">Tempo (min/km)</h4>
          <Tidsserie
            x={p.t}
            serier={[{ id: 'tempo', navn: 'Tempo', verdier: temposerie, klasse: 'ts-tempo', form: 'linje' }]}
            hoyde={150}
            snuY
            yDomene={tempoakse}
            xMerker={tidsmerker}
            yFormat={(v) => tempo(v)}
            aktiv={aktiv}
            onAktiv={setAktiv}
            beskrivelse="Tempo i min/km gjennom økta"
            tips={(i) => (
              <>
                <b>{klokke(p.t[i])}</b>
                <span className="tips-tall">{temposerie[i] != null ? `${tempo(temposerie[i]!)} /km` : 'stopp'}</span>
                {p.puls?.[i] != null && <span className="tips-rad">{p.puls[i]} slag/min</span>}
              </>
            )}
          />
        </>
      )}

      {spor && spor.runder.length > 1 && (
        <p className="fotnote">Runder i grått er pauser eller rolige drag.</p>
      )}
      {spor && spor.runder.length > 1 && (
        <table className="blokktabell runder">
          <thead>
            <tr>
              <th scope="col">Runde</th>
              <th scope="col">Tid</th>
              <th scope="col">Km</th>
              <th scope="col">Tempo</th>
              <th scope="col">Puls (maks)</th>
            </tr>
          </thead>
          <tbody>
            {spor.runder.map((r, i) => {
              // Noen klokker lagrer ikke snittfart per runde; regn den ut fra distanse og tid.
              const tp = minPerKm(r.fart ?? (r.dist_m && r.tid_s ? r.dist_m / r.tid_s : null))
              const hvile = erHvilerunde(r, tp, rundetempoMedian)
              return (
                <tr key={i} className={hvile ? 'hvile' : undefined} onMouseEnter={() => setAktiv(nermesteIndeks(p!.t, r.start_s + r.tid_s / 2))} onMouseLeave={() => setAktiv(null)}>
                  <td>{i + 1}</td>
                  <td>{klokke(r.tid_s)}</td>
                  <td>{r.dist_m ? km(r.dist_m / 1000) : ''}</td>
                  <td>{erLop && tp ? tempo(tp) : ''}</td>
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

/**
 * Y-område for tempo: fra 2. persentil, og maks 70 % tregere enn det,
 * så gåpauser mellom intervaller ikke strekker aksen.
 */
function tempodomene(v: (number | null)[]): [number, number] {
  const s = v.filter((x): x is number => x != null).sort((a, b) => a - b)
  if (!s.length) return [3, 7]
  const rask = s[Math.floor(s.length * 0.02)]
  const treg = Math.min(s[Math.floor(s.length * 0.95)], rask * 1.7)
  return [rask - 0.15, treg + 0.15]
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
