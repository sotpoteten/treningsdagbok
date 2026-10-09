import { varighetLang } from '../data/format'
import { SONER, type SoneMin } from '../data/typer'

interface Props {
  sone: SoneMin
  styrke?: number
  /** Total som bredden regnes mot. Standard er summen av segmentene. */
  total?: number
  tynn?: boolean
}

/** Stablet stolpe I1–I5 + styrke med 2 px mellomrom mellom segmentene. */
export function Sonestolpe({ sone, styrke = 0, total, tynn }: Props) {
  const deler = [
    ...SONER.map((s) => ({ id: s, navn: s, min: sone[s] ?? 0 })),
    { id: 'styrke', navn: 'Styrke', min: styrke },
  ].filter((d) => d.min > 0)
  const sum = total ?? deler.reduce((a, d) => a + d.min, 0)
  if (!sum) return <div className={tynn ? 'sonestolpe tynn tom' : 'sonestolpe tom'} aria-hidden />
  const tekst = deler.map((d) => `${d.navn} ${varighetLang(d.min)}`).join(', ')
  return (
    <div className={tynn ? 'sonestolpe tynn' : 'sonestolpe'} role="img" aria-label={tekst} title={tekst}>
      {deler.map((d) => (
        <i key={d.id} className={`seg seg-${d.id.toLowerCase()}`} style={{ flexGrow: d.min / sum }} />
      ))}
    </div>
  )
}
