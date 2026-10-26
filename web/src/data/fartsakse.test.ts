import { describe, expect, it } from 'vitest'
import { bevegelsesfart, fartsdomene, tempomerker, tilFart, tilMinPerKm } from './fartsakse'

/** n punkter med samme tempo (min/km), som fart. */
const tempo = (minPerKm: number, n: number) => Array.from({ length: n }, () => tilFart(minPerKm))
const andelInne = (v: number[], [lo, hi]: [number, number]) => v.filter((x) => x >= lo && x <= hi).length / v.length
/** Hvor høyt i grafen (0 = bunn, 1 = topp) en fart havner. */
const hoyde = (v: number, [lo, hi]: [number, number]) => (v - lo) / (hi - lo)

describe('fartsakse', () => {
  it('regner mellom fart og tempo', () => {
    expect(tilMinPerKm(tilFart(4.5))).toBeCloseTo(4.5)
    expect(bevegelsesfart(0.5)).toBeNull()
    expect(bevegelsesfart(null)).toBeNull()
    expect(bevegelsesfart(3)).toBe(3)
  })

  it('beholder gåing i et tåg (som 10Mila) innenfor aksen', () => {
    // Løping på 5–6 min/km og lange partier med gåing på 10–14 min/km.
    const v = [...tempo(5, 200), ...tempo(6, 200), ...tempo(10, 150), ...tempo(12, 150), ...tempo(14, 100)]
    const d = fartsdomene(v)
    expect(andelInne(v, d)).toBe(1)
    const merker = tempomerker(d)
    expect(merker).toContain(10)
    expect(merker.every((p) => p >= 4.5 && p <= 15)).toBe(true)
  })

  it('gir arbeidsdelen i intervaller den øvre delen av grafen', () => {
    // 3:15 i dragene, rolig jogg på 6:00 og noe gåing på 9:00 mellom.
    const v = [...tempo(3.25, 360), ...tempo(6, 300), ...tempo(9, 60), ...tempo(5, 200)]
    const d = fartsdomene(v)
    expect(andelInne(v, d)).toBe(1)
    expect(hoyde(tilFart(3.25), d)).toBeGreaterThan(0.85)
    expect(hoyde(tilFart(6), d)).toBeLessThan(0.4)
  })

  it('klemmer aksen til 2:30–20:00 min/km', () => {
    const v = [...tempo(1.5, 10), ...tempo(5, 1000), ...tempo(19.9, 10)]
    const [lo, hi] = fartsdomene([...tempo(1.5, 100), ...v, ...tempo(19.9, 100)])
    expect(hi).toBeLessThan(tilFart(2.4))
    expect(lo).toBeGreaterThan(tilFart(21))
  })

  it('har ikke for smal akse for en jevn mølleøkt', () => {
    const d = fartsdomene(tempo(4.5, 500))
    expect(d[1] - d[0]).toBeGreaterThanOrEqual(0.6)
    expect(tempomerker(d).length).toBeGreaterThanOrEqual(2)
  })

  it('velger runde tempo uten at etikettene står for tett', () => {
    const d: [number, number] = [tilFart(20), tilFart(2.5)]
    const merker = tempomerker(d)
    expect(merker.length).toBeGreaterThanOrEqual(3)
    expect(merker.length).toBeLessThanOrEqual(5)
    const f = merker.map(tilFart).sort((a, b) => a - b)
    for (let i = 1; i < f.length; i++) expect(f[i] - f[i - 1]).toBeGreaterThanOrEqual((d[1] - d[0]) * 0.2)
    expect(merker).toContain(3)
  })
})
