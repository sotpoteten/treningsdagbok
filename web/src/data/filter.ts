import { okttyper, type Okttype } from './aggregat'
import type { Dag, Okt } from './typer'

export type Filtertype = Okttype | 'konk'

export const FILTERTYPER: { id: Filtertype; navn: string }[] = [
  { id: 'loping', navn: 'Løping' },
  { id: 'ski', navn: 'Ski' },
  { id: 'sykkel', navn: 'Sykkel/annet' },
  { id: 'styrke', navn: 'Styrke' },
  { id: 'otek', navn: 'O-teknikk' },
  { id: 'konk', navn: 'Konkurranse' },
]

export interface Filter {
  sok: string
  typer: Set<Filtertype>
}

export function lesFilter(p: URLSearchParams): Filter {
  const typer = new Set((p.get('type') ?? '').split(',').filter(Boolean) as Filtertype[])
  return { sok: p.get('q') ?? '', typer }
}

export function erAktivt(f: Filter): boolean {
  return f.sok.trim() !== '' || f.typer.size > 0
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Søk i navn, beskrivelse og notat. Hvert søkeord må finnes som begynnelsen av et ord,
 * så «NM» treffer «NM-sprint», men ikke «gjennomført». Valgte typer gir treff hvis én passer.
 */
export function lagTreff(f: Filter, dagerPerDato: Map<string, Dag>): (o: Okt) => boolean {
  const monstre = f.sok
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}`, 'iu'))
  return (o) => {
    if (monstre.length) {
      const tekst = `${o.navn} ${o.beskrivelse ?? ''} ${o.kommentar ?? ''}`
      if (!monstre.every((m) => m.test(tekst))) return false
    }
    if (f.typer.size) {
      const t = okttyper(o)
      const konk = dagerPerDato.get(o.dato)?.konkurranse ?? false
      return [...f.typer].some((x) => (x === 'konk' ? konk : t.has(x)))
    }
    return true
  }
}
