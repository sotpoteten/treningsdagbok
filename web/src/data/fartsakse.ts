/**
 * Tempokurven tegnes som fart (m/s) med tempoetiketter (min/km). På en fartsakse er raskere
 * høyere uten at aksen snus, og trege partier som gåing og rolige pauser får plass uten å
 * presse dragene sammen.
 */

/** Under denne farten (≈ 20:50 min/km) står man i praksis stille: hull i kurven. */
export const STILLSTAND_MS = 0.8

/** m/s ↔ min/km. */
export const tilMinPerKm = (v: number) => 1000 / 60 / v
export const tilFart = (minPerKm: number) => 1000 / 60 / minPerKm

/** Aksen klemmes til 2:30–20:00 min/km. */
const RASKEST = tilFart(2.5)
const TREGEST = tilFart(20)

/** Fart, eller null når det er stillstand (eller farten mangler). */
export const bevegelsesfart = (v: number | null | undefined) => (v != null && v > STILLSTAND_MS ? v : null)

/** Ikke smalere enn dette (m/s), så en jevn mølleøkt ikke blir ren støy. */
const MINSTE_SPENN = 0.6

/**
 * Y-område i m/s: fra 0,5. til 99,5. persentil av farten i bevegelse, klemt til
 * 2:30–20:00 min/km, med litt luft i begge ender.
 */
export function fartsdomene(v: (number | null)[]): [number, number] {
  const s = v.filter((x): x is number => x != null && x > STILLSTAND_MS).sort((a, b) => a - b)
  if (!s.length) return [tilFart(7), tilFart(3)]
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  let lo = Math.max(TREGEST, q(0.005))
  let hi = Math.min(RASKEST, q(0.995))
  if (hi - lo < MINSTE_SPENN) {
    const midt = (hi + lo) / 2
    lo = Math.max(TREGEST, midt - MINSTE_SPENN / 2)
    hi = Math.min(RASKEST, lo + MINSTE_SPENN)
  }
  const luft = (hi - lo) * 0.04
  return [Math.max(STILLSTAND_MS, lo - luft), hi + luft]
}

/** Tempoene etiketter velges blant, de runde først. */
const RUNDE = [3, 4, 5, 10, 6, 8, 15, 20]
const HALVE = [2.5, 3.5, 4.5, 5.5, 7, 12]
const FINE = Array.from({ length: 23 }, (_, i) => 2.5 + i * 0.25)

/**
 * Tempoetiketter (min/km) inne i fartsdomenet, med minst `avstand` av høyden mellom seg.
 * Runde tempo velges først (10:00 foran 6:00 og 8:00, så gåing får en etikett), så halve,
 * og fine bare hvis det ellers blir færre enn to.
 */
export function tempomerker([lo, hi]: [number, number], avstand = 0.2): number[] {
  const spenn = hi - lo
  const valgt: number[] = []
  const ledig = (p: number) => valgt.every((q) => Math.abs(tilFart(q) - tilFart(p)) >= spenn * avstand)
  const prov = (liste: number[]) => {
    for (const p of liste) {
      const f = tilFart(p)
      if (f >= lo && f <= hi && !valgt.includes(p) && ledig(p)) valgt.push(p)
    }
  }
  prov(RUNDE)
  prov(HALVE)
  if (valgt.length < 2) prov(FINE)
  return valgt.sort((a, b) => a - b)
}
