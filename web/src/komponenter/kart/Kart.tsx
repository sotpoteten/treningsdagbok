// Lastes dynamisk (React.lazy), så MapLibre bare hentes når et øktpanel med GPS-spor åpnes.
import { LngLatBounds, Map as Kartmotor, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre kjører fliser i en web worker. Vite bunter den, og vi peker MapLibre dit.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'

setWorkerUrl(workerUrl)

export type Kartlag = 'topo' | 'osm'

const KILDER: Record<Kartlag, { fliser: string[]; attribusjon: string; maks: number }> = {
  topo: {
    fliser: ['https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png'],
    attribusjon: '© <a href="https://www.kartverket.no/">Kartverket</a>',
    maks: 18,
  },
  osm: {
    fliser: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribusjon: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsytere',
    maks: 19,
  },
}

function stil(lag: Kartlag): StyleSpecification {
  const k = KILDER[lag]
  return {
    version: 8,
    sources: { bakgrunn: { type: 'raster', tiles: k.fliser, tileSize: 256, maxzoom: k.maks, attribution: k.attribusjon } },
    layers: [{ id: 'bakgrunn', type: 'raster', source: 'bakgrunn' }],
  }
}

interface Props {
  lat: (number | null)[]
  lon: (number | null)[]
  lag: Kartlag
  aktiv: number | null
  onAktiv: (i: number | null) => void
}

/** Kart med sporet tegnet i blekk, start- og sluttmerke og et merke som følger kurven. */
export default function Kart({ lat, lon, lag, aktiv, onAktiv }: Props) {
  const beholder = useRef<HTMLDivElement>(null)
  const kart = useRef<Kartmotor | null>(null)
  const onAktivRef = useRef(onAktiv)
  onAktivRef.current = onAktiv

  // Punktene med posisjon, med indeksen i den fulle serien.
  const punkter = lat.flatMap((la, i) => (la != null && lon[i] != null ? [{ i, lng: lon[i] as number, lat: la }] : []))

  useEffect(() => {
    if (!beholder.current || !punkter.length) return
    const m = new Kartmotor({ container: beholder.current, style: stil(lag), attributionControl: { compact: true }, cooperativeGestures: true })
    kart.current = m
    const grenser = new LngLatBounds()
    for (const p of punkter) grenser.extend([p.lng, p.lat])
    m.fitBounds(grenser, { padding: 28, duration: 0 })

    const leggTilSpor = () => {
      const koord = punkter.map((p) => [p.lng, p.lat])
      m.addSource('spor', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: koord } } })
      m.addSource('ender', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { rolle: 'start' }, geometry: { type: 'Point', coordinates: koord[0] } },
            { type: 'Feature', properties: { rolle: 'slutt' }, geometry: { type: 'Point', coordinates: koord[koord.length - 1] } },
          ],
        },
      })
      m.addSource('aktiv', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Papirkant under blekkstreken, så sporet leses på alle kartfarger.
      m.addLayer({ id: 'spor-kant', type: 'line', source: 'spor', paint: { 'line-color': '#fafaf5', 'line-width': 6 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({ id: 'spor', type: 'line', source: 'spor', paint: { 'line-color': '#1d1d1b', 'line-width': 3 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({
        id: 'ender',
        type: 'circle',
        source: 'ender',
        paint: {
          'circle-radius': 6,
          'circle-color': ['match', ['get', 'rolle'], 'start', '#fafaf5', '#1d1d1b'],
          'circle-stroke-color': '#1d1d1b',
          'circle-stroke-width': 2,
        },
      })
      m.addLayer({ id: 'aktiv', type: 'circle', source: 'aktiv', paint: { 'circle-radius': 6, 'circle-color': '#2f6fa8', 'circle-stroke-color': '#fafaf5', 'circle-stroke-width': 2 } })
    }
    m.on('load', leggTilSpor)

    // Hover på kartet: nærmeste punkt på sporet (innen 30 px) blir aktivt.
    m.on('mousemove', (e) => {
      let beste = -1
      let avstand = Infinity
      for (const p of punkter) {
        const s = m.project([p.lng, p.lat])
        const d = (s.x - e.point.x) ** 2 + (s.y - e.point.y) ** 2
        if (d < avstand) [avstand, beste] = [d, p.i]
      }
      onAktivRef.current(avstand < 900 ? beste : null)
    })
    m.on('mouseout', () => onAktivRef.current(null))

    return () => {
      m.remove()
      kart.current = null
    }
    // Sporet og kartlaget bygger kartet på nytt; aktiv-merket oppdateres i egen effekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, lag])

  useEffect(() => {
    const m = kart.current
    const kilde = m?.getSource('aktiv') as GeoJSONSource | undefined
    if (!kilde) return
    const la = aktiv != null ? lat[aktiv] : null
    const lo = aktiv != null ? lon[aktiv] : null
    kilde.setData({
      type: 'FeatureCollection',
      features: la != null && lo != null ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lo, la] } }] : [],
    })
  }, [aktiv, lat, lon])

  return <div className="kart" ref={beholder} role="region" aria-label="Kart med GPS-sporet for økta" />
}
