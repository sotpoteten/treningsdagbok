import type { Dag } from '../data/typer'

const MARKORER: { felt: keyof Dag; navn: string }[] = [
  { felt: 'konkurranse', navn: 'Konk.' },
  { felt: 'reise', navn: 'Reise' },
  { felt: 'hoyde', navn: 'Høyde' },
  { felt: 'fridag', navn: 'Fri' },
]

/** Små kotebrune etiketter for reise, høydedøgn, fridag og konkurranse. */
export function Dagsmarkorer({ rapport }: { rapport: Dag | null }) {
  if (!rapport) return null
  const aktive = MARKORER.filter((m) => rapport[m.felt])
  if (!aktive.length) return null
  return (
    <span className="markorer">
      {aktive.map((m) => (
        <span key={m.felt} className={`markor markor-${m.felt}`}>
          {m.navn}
        </span>
      ))}
    </span>
  )
}

/** Stempel for syk og skadet. Står skrått over dagen, som et stempel på papir. */
export function Stempler({ rapport }: { rapport: Dag | null }) {
  if (!rapport || (!rapport.syk && !rapport.skadet)) return null
  return (
    <span className="stempler">
      {rapport.syk && <span className="stempel">Syk</span>}
      {rapport.skadet && <span className="stempel">Skadet</span>}
    </span>
  )
}
