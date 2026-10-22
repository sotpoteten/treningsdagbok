import { memo, useMemo, useState } from 'react'
import { summer } from '../data/aggregat'
import { HOYDELAG_ETIKETT, hoydelag, km, pulsomrade, timer, ukespenn } from '../data/format'
import { SONER, type Okt, type Profil } from '../data/typer'
import type { Uke } from '../data/uker'

interface Props {
  uker: Uke[] // nyeste først
  synlige: Set<string>
  treff: ((o: Okt) => boolean) | null
  pulssoner: Profil['pulssoner']
  onVelg: (nokkel: string) => void
}

// Omtrentlig ISO-uke der hver måned begynner, til merkene i venstre marg.
const MANEDER: [string, number][] = [
  ['jan', 1], ['feb', 5], ['mar', 9], ['apr', 14], ['mai', 18], ['jun', 22],
  ['jul', 27], ['aug', 31], ['sep', 36], ['okt', 40], ['nov', 44], ['des', 49],
]

/**
 * Årsnavigasjon som et høydelagskart: én kolonne per år, én rute per uke,
 * farget etter treningstimer. Utsnittet som vises i kalenderen er rammet inn.
 */
export const Hoydelag = memo(function Hoydelag({ uker, synlige, treff, pulssoner, onVelg }: Props) {
  const [hover, setHover] = useState<Uke | null>(null)

  const { ar, info } = useMemo(() => {
    const perAr = new Map<number, Uke[]>()
    const info = new Map<string, { lag: number; minutter: number; km: number }>()
    for (const u of uker) {
      const s = summer(u.okter)
      info.set(u.nokkel, { lag: hoydelag(s.minutter), minutter: s.minutter, km: s.km })
      const liste = perAr.get(u.ar)
      if (liste) liste.push(u)
      else perAr.set(u.ar, [u])
    }
    return { ar: [...perAr.entries()].sort((a, b) => a[0] - b[0]), info }
  }, [uker])

  const vist = hover ? info.get(hover.nokkel)! : null

  return (
    <nav className="hoydelag" aria-label="Hopp til uke">
      <div className={treff ? 'hl-kart filtrert' : 'hl-kart'} style={{ gridTemplateColumns: `22px repeat(${ar.length}, 1fr)` }}>
        <span className="hl-hjorne" />
        {ar.map(([a, liste]) => (
          <button key={a} type="button" className="hl-ar" onClick={() => onVelg(liste[0].nokkel)} title={`Gå til ${a}`}>
            {String(a).slice(2)}
          </button>
        ))}
        {MANEDER.map(([navn, uke]) => (
          <span key={navn} className="hl-mnd" style={{ gridRow: uke + 1 }}>
            {navn}
          </span>
        ))}
        {ar.map(([a, liste], kol) =>
          liste.map((u) => {
            const i = info.get(u.nokkel)!
            const klasser = ['hl-uke', `lag-${i.lag}`, synlige.has(u.nokkel) && 'synlig', treff && u.okter.some(treff) && 'treff']
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={u.nokkel}
                type="button"
                tabIndex={-1}
                className={klasser}
                style={{ gridColumn: kol + 2, gridRow: u.uke + 1 }}
                aria-label={`Uke ${u.uke} ${a}: ${timer(i.minutter)} timer`}
                onMouseEnter={() => setHover(u)}
                onMouseLeave={() => setHover((h) => (h === u ? null : h))}
                onClick={() => onVelg(u.nokkel)}
              />
            )
          }),
        )}
      </div>
      <div className="hl-info" aria-live="polite">
        {hover && vist ? (
          <>
            <b>Uke {hover.uke} · {hover.ar}</b>
            <span>{ukespenn(hover.mandag, hover.sondag)}</span>
            <span className="hl-sum">
              {timer(vist.minutter)} t · {km(vist.km)} km
            </span>
          </>
        ) : (
          <span className="hl-hint">Timer per uke</span>
        )}
      </div>
      <ol className="hl-tegnforklaring" aria-label="Timer per uke">
        {HOYDELAG_ETIKETT.map((e, i) => (
          <li key={e}>
            <i className={`lag-${i}`} />
            {e}
          </li>
        ))}
      </ol>
      <div className="tegnforklaring-soner">
        <span className="hl-hint">Soner · puls</span>
        <ol aria-label="Intensitetssoner">
          {SONER.map((s) => (
            <li key={s}>
              <i className={`seg-${s.toLowerCase()}`} />
              <b>{s}</b>
              <span>
                {pulsomrade(pulssoner, s)}
              </span>
            </li>
          ))}
          <li>
            <i className="seg-styrke" />
            <b>Styrke</b>
          </li>
        </ol>
      </div>
    </nav>
  )
})
