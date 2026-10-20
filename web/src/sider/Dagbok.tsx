import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { erAktivt, lagTreff, lesFilter, type Filter } from '../data/filter'
import { dato } from '../data/format'
import { harSpor, type Dagbok as DagbokData } from '../data/last'
import type { Okt } from '../data/typer'
import { isoDato, type Uke } from '../data/uker'
import { Hoydelag } from '../komponenter/Hoydelag'
import { Oktpanel } from '../komponenter/Oktpanel'
import { Sok } from '../komponenter/Sok'
import { Topplinje } from '../komponenter/Topplinje'
import { Ukerad } from '../komponenter/Ukerad'

type Rad = { type: 'mnd'; nokkel: string; tittel: string } | { type: 'uke'; nokkel: string; uke: Uke }

/** Ukene med en månedsskiller foran første uke i hver måned (måneden til ukas torsdag). */
function byggRader(uker: Uke[]): Rad[] {
  const rader: Rad[] = []
  let forrige = ''
  for (const u of uker) {
    const torsdag = u.dager[3].dato
    const mnd = torsdag.slice(0, 7)
    if (mnd !== forrige) {
      const tittel = dato(torsdag, 'MMMM yyyy')
      rader.push({ type: 'mnd', nokkel: `m-${mnd}`, tittel: tittel[0].toUpperCase() + tittel.slice(1) })
      forrige = mnd
    }
    rader.push({ type: 'uke', nokkel: u.nokkel, uke: u })
  }
  return rader
}

export function Dagbok({ dagbok }: { dagbok: DagbokData }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = useMemo(() => lesFilter(params), [params])
  const aktivt = erAktivt(filter)
  const treff = useMemo(() => (aktivt ? lagTreff(filter, dagbok.dagerPerDato) : null), [aktivt, filter, dagbok])
  const antallTreff = useMemo(() => (treff ? dagbok.okter.filter(treff).length : null), [treff, dagbok])

  const rader = useMemo(() => byggRader(dagbok.uker), [dagbok])
  const radPerUke = useMemo(() => new Map(rader.map((r, i) => [r.nokkel, i])), [rader])
  const ukePerDato = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of dagbok.uker) for (const d of u.dager) m.set(d.dato, u.nokkel)
    return m
  }, [dagbok])

  const valgt = id ? (dagbok.oktPerId.get(id) ?? null) : null
  const medSpor = useMemo(() => new Set(dagbok.garmin.filter((a) => a.okt_id && harSpor(dagbok, a)).map((a) => a.okt_id!)), [dagbok])
  const idag = isoDato(new Date())

  const flate = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({
    count: rader.length,
    getScrollElement: () => flate.current,
    estimateSize: (i) => (rader[i].type === 'mnd' ? 52 : rader[i].uke.okter.length ? 320 : 150),
    overscan: 3,
    getItemKey: (i) => rader[i].nokkel,
  })

  // Ukene som faktisk står i vinduet, til rammen i høydelagsstripen.
  const topp = v.scrollOffset ?? 0
  const bunn = topp + (v.scrollRect?.height ?? 0)
  const elementer = v.getVirtualItems()
  const synlige = useMemo(() => {
    const s = new Set<string>()
    for (const it of elementer) {
      const r = rader[it.index]
      if (r.type === 'uke' && it.end > topp + 40 && it.start < bunn - 40) s.add(r.nokkel)
    }
    return s
  }, [elementer, rader, topp, bunn])

  const gaTilUke = useCallback(
    (nokkel: string, bareHvisSkjult = false) => {
      const i = radPerUke.get(nokkel)
      if (i == null) return
      if (bareHvisSkjult && synlige.has(nokkel)) return
      v.scrollToIndex(Math.max(0, rader[i - 1]?.type === 'mnd' ? i - 1 : i), { align: 'start' })
    },
    [radPerUke, rader, synlige, v],
  )

  // Lenke til en uke (?uke=2025-14), f.eks. fra analysesiden: rull dit én gang.
  const onsketUke = params.get('uke')
  const rulletTilUke = useRef<string | null>(null)
  useEffect(() => {
    if (onsketUke && rulletTilUke.current !== onsketUke && radPerUke.has(onsketUke)) {
      // Vent til listen er tegnet og målt første gang.
      const id = requestAnimationFrame(() => {
        rulletTilUke.current = onsketUke
        gaTilUke(onsketUke)
      })
      return () => cancelAnimationFrame(id)
    }
  }, [onsketUke, gaTilUke, radPerUke])

  // Direkte lenke til en økt: rull til uka én gang.
  const rulletTil = useRef<string | null>(null)
  useEffect(() => {
    if (valgt && rulletTil.current !== valgt.id) {
      rulletTil.current = valgt.id
      gaTilUke(ukePerDato.get(valgt.dato)!, true)
    }
  }, [valgt, gaTilUke, ukePerDato])

  // Siste filter vi har bedt om. To raske endringer (skrive og så klikke en brikke) skal
  // bygge på hverandre, selv om URL-en ikke er oppdatert mellom dem.
  const sisteFilter = useRef(filter)
  useLayoutEffect(() => {
    sisteFilter.current = filter
  }, [filter])

  function endreFilter(endre: (f: Filter) => Filter) {
    const f = endre(sisteFilter.current)
    sisteFilter.current = f
    const p = new URLSearchParams()
    if (f.sok) p.set('q', f.sok)
    if (f.typer.size) p.set('type', [...f.typer].join(','))
    setParams(p, { replace: true })
  }

  function nesteTreff(retning: 1 | -1) {
    if (!treff) return
    const forste = elementer.find((it) => rader[it.index].type === 'uke' && it.end > topp + 40)
    const start = forste ? forste.index : 0
    for (let i = start + retning; i >= 0 && i < rader.length; i += retning) {
      const r = rader[i]
      if (r.type === 'uke' && r.uke.okter.some(treff)) {
        v.scrollToIndex(i, { align: 'start' })
        return
      }
    }
  }

  const sok = params.toString()
  const lukk = useCallback(() => navigate({ pathname: '/', search: sok }), [navigate, sok])
  const gaTil = useCallback((o: Okt) => navigate({ pathname: `/okt/${o.id}`, search: sok }, { replace: true }), [navigate, sok])

  return (
    <>
      <Topplinje>
        <Sok filter={filter} antallTreff={antallTreff} onEndre={endreFilter} onTreff={nesteTreff} />
      </Topplinje>
      <main className={valgt ? 'dagbok med-panel' : 'dagbok'}>
        <Hoydelag uker={dagbok.uker} synlige={synlige} treff={treff} pulssoner={dagbok.profil.pulssoner} onVelg={gaTilUke} />
        <div className="kalender" ref={flate}>
          <div className="kalender-innhold" style={{ height: v.getTotalSize() }}>
            {elementer.map((it) => {
              const r = rader[it.index]
              return (
                <div key={it.key} data-index={it.index} ref={v.measureElement} className="rad" style={{ transform: `translateY(${it.start}px)` }}>
                  {r.type === 'mnd' ? (
                    <h2 className="maned">{r.tittel}</h2>
                  ) : (
                    <Ukerad uke={r.uke} treff={treff} valgtId={valgt?.id ?? null} idag={idag} medSpor={medSpor} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        {valgt && <Oktpanel okt={valgt} dagbok={dagbok} onLukk={lukk} onGaTil={gaTil} />}
        {id && !valgt && (
          <aside className="oktpanel">
            <p>Fant ikke økta. Den kan være fra før 1. november 2019.</p>
            <button type="button" className="lenkeknapp" onClick={lukk}>
              Tilbake til dagboka
            </button>
          </aside>
        )}
      </main>
    </>
  )
}
