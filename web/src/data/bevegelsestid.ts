/**
 * Tid i bevegelse for Garmin-spor. Sporene er tynnet til ett punkt per 5 s, og et hull i
 * `t` på over 10 s er en pause på klokka (stemmer med FIT-hendelsene «timer stop»).
 * Pausene trekkes ut av tidsaksen, så kurvene viser tid i bevegelse.
 */

/** Hull i klokketiden over dette regnes som pause. */
export const PAUSEGRENSE_S = 10

export interface Pause {
  /** Indeksen til første punkt etter pausen. */
  indeks: number
  /** Klokketid for siste punkt før og første punkt etter pausen. */
  fra_s: number
  til_s: number
  /** Tiden som er tatt ut av aksen. */
  tattUt_s: number
}

export interface Bevegelsestid {
  /** Tid i bevegelse for hvert punkt, samme indeks som `t`. */
  x: number[]
  pauser: Pause[]
  /** Sum av tiden som er tatt ut. */
  tattUt_s: number
  /** Vanlig steg mellom punktene, som hver pause krympes til. */
  steg: number
  /** Klokketid i sekunder fra start → tid i bevegelse. */
  tilBevegelse: (klokke_s: number) => number
}

/** Medianen av stegene som ikke er pauser, eller 5 s. */
function vanligSteg(t: number[]) {
  const d: number[] = []
  for (let i = 1; i < t.length; i++) {
    const s = t[i] - t[i - 1]
    if (s > 0 && s <= PAUSEGRENSE_S) d.push(s)
  }
  if (!d.length) return 5
  d.sort((a, b) => a - b)
  return d[Math.floor(d.length / 2)]
}

export function bevegelsestid(t: number[]): Bevegelsestid {
  const steg = vanligSteg(t)
  const x: number[] = new Array(t.length)
  const pauser: Pause[] = []
  let tattUt = 0
  for (let i = 0; i < t.length; i++) {
    if (i === 0) {
      x[0] = t[0]
      continue
    }
    const d = t[i] - t[i - 1]
    if (d > PAUSEGRENSE_S) {
      const ut = d - steg
      pauser.push({ indeks: i, fra_s: t[i - 1], til_s: t[i], tattUt_s: ut })
      tattUt += ut
      x[i] = x[i - 1] + steg
    } else x[i] = x[i - 1] + d
  }

  function tilBevegelse(s: number) {
    const n = t.length
    if (!n) return s
    if (s <= t[0]) return s - t[0] + x[0]
    if (s >= t[n - 1]) return x[n - 1] + (s - t[n - 1])
    // Binærsøk etter siste punkt med t <= s.
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (t[m] <= s) lo = m
      else hi = m
    }
    const d = t[hi] - t[lo]
    // Inne i en pause havner tidspunktet forholdsmessig på det korte steget som er igjen.
    return d > 0 ? x[lo] + ((s - t[lo]) / d) * (x[hi] - x[lo]) : x[lo]
  }

  return { x, pauser, tattUt_s: tattUt, steg, tilBevegelse }
}

/**
 * Glidende median over `n` punkter (oddetall) innenfor hvert segment, så GPS-støy ikke
 * skjuler forløpet. `brudd` er indeksene der et nytt segment starter (etter en pause);
 * vinduet går aldri over et brudd. Null forblir null og er ikke med i vinduet.
 */
export function glidendeMedian(v: (number | null)[], n: number, brudd: number[] = []): (number | null)[] {
  const h = (n - 1) / 2
  const starter = [0, ...brudd.filter((b) => b > 0 && b < v.length), v.length]
  const ut: (number | null)[] = new Array(v.length).fill(null)
  for (let k = 0; k < starter.length - 1; k++) {
    const fra = starter[k]
    const til = starter[k + 1]
    for (let i = fra; i < til; i++) {
      if (v[i] == null) continue
      const vindu = v.slice(Math.max(fra, i - h), Math.min(til, i + h + 1)).filter((y): y is number => y != null)
      vindu.sort((a, b) => a - b)
      ut[i] = vindu[Math.floor(vindu.length / 2)]
    }
  }
  return ut
}
