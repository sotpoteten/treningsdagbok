import { SONER, type Okt, type Sone } from './typer'

// Reglene fra CLAUDE.md:
// - varighet = minutter i sone + minutter styrke (ligger ferdig i varighet_min)
// - o-teknikk er en del av løpetiden og legges ikke til
// - distanse finnes bare for løping

export interface Sum {
  okter: number
  minutter: number
  km: number
  sone: Record<Sone, number>
  styrke: number
  otek: number
}

export function tomSum(): Sum {
  return {
    okter: 0,
    minutter: 0,
    km: 0,
    sone: { I1: 0, I2: 0, I3: 0, I4: 0, I5: 0 },
    styrke: 0,
    otek: 0,
  }
}

export function leggTil(sum: Sum, okt: Okt): Sum {
  sum.okter += 1
  sum.minutter += okt.varighet_min
  sum.km += okt.distanse_km
  for (const s of SONER) sum.sone[s] += okt.sone_min[s] ?? 0
  sum.styrke += okt.styrke_min
  sum.otek += okt.otek_min
  return sum
}

export function summer(okter: Iterable<Okt>): Sum {
  const sum = tomSum()
  for (const o of okter) leggTil(sum, o)
  return sum
}

/** Summer gruppert på en nøkkel, f.eks. år ("2025") eller måned ("2025-03"). */
export function summerEtter(okter: Iterable<Okt>, nokkel: (o: Okt) => string): Map<string, Sum> {
  const ut = new Map<string, Sum>()
  for (const o of okter) {
    const k = nokkel(o)
    let s = ut.get(k)
    if (!s) ut.set(k, (s = tomSum()))
    leggTil(s, o)
  }
  return ut
}

export const perAr = (o: Okt) => o.dato.slice(0, 4)
export const perManed = (o: Okt) => o.dato.slice(0, 7)

/** Snittfart i min/km for en løpeblokk, eller null uten distanse. */
export function tempo(minutter: number, km: number | null): number | null {
  if (!km || km <= 0 || minutter <= 0) return null
  return minutter / km
}

/** Type for filteret, utledet fra blokkene. En økt kan ha flere. */
export type Okttype = 'loping' | 'ski' | 'sykkel' | 'styrke' | 'otek'

export function okttyper(okt: Okt): Set<Okttype> {
  const t = new Set<Okttype>()
  for (const b of okt.blokker) {
    const id = b.aktivitet_id
    if (id <= 3) t.add('loping')
    else if (id <= 6) t.add('ski')
    else if (id <= 8) t.add('sykkel')
    else if (id <= 11) t.add('otek')
    else t.add('styrke')
  }
  return t
}
