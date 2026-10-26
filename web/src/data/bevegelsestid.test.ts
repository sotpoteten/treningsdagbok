import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bevegelsestid, glidendeMedian } from './bevegelsestid'
import type { GarminSpor } from './typer'

/** Klokketid hvert 5. sekund fra `fra` til og med `til`. */
const strekk = (fra: number, til: number) => Array.from({ length: (til - fra) / 5 + 1 }, (_, i) => fra + i * 5)

describe('bevegelsestid', () => {
  it('er lik klokketiden når klokka aldri er pauset', () => {
    const t = strekk(0, 600)
    const b = bevegelsestid(t)
    expect(b.x).toEqual(t)
    expect(b.pauser).toEqual([])
    expect(b.tattUt_s).toBe(0)
    expect(b.tilBevegelse(123)).toBe(123)
    expect(b.tilBevegelse(9999)).toBe(9999)
  })

  it('krymper hull over 10 s til det vanlige steget', () => {
    // Pauser 100→300 (200 s) og 500→600 (100 s). Hull på 10 s er ikke pause.
    const t = [...strekk(0, 100), ...strekk(300, 500), 510, 515, ...strekk(615, 700)]
    const b = bevegelsestid(t)
    expect(b.steg).toBe(5)
    expect(b.pauser.map((p) => [p.fra_s, p.til_s])).toEqual([
      [100, 300],
      [515, 615],
    ])
    expect(b.tattUt_s).toBe(195 + 95)
    expect(b.x[t.indexOf(300)]).toBe(105)
    expect(b.x[t.indexOf(700)]).toBe(700 - 290)
    // Ingen steg i x er større enn 10 s.
    for (let i = 1; i < b.x.length; i++) expect(b.x[i] - b.x[i - 1]).toBeLessThanOrEqual(10)
  })

  it('regner rundestarter i klokketid om til tid i bevegelse', () => {
    const t = [...strekk(0, 100), ...strekk(300, 600)]
    const b = bevegelsestid(t)
    expect(b.tilBevegelse(0)).toBe(0)
    expect(b.tilBevegelse(50)).toBe(50)
    // Runde som starter rett etter pausen, havner der kurven fortsetter.
    expect(b.tilBevegelse(300)).toBe(105)
    expect(b.tilBevegelse(420)).toBe(225)
    // Et tidspunkt inne i pausen havner mellom punktene på hver side.
    const inni = b.tilBevegelse(200)
    expect(inni).toBeGreaterThan(100)
    expect(inni).toBeLessThan(105)
    expect(b.tilBevegelse(600)).toBe(405)
  })
})

describe('glidendeMedian', () => {
  it('glatter innenfor segmentet og aldri over et brudd', () => {
    expect(glidendeMedian([1, 1, 9, 1, 1], 3)).toEqual([1, 1, 1, 1, 1])
    // Med brudd før indeks 4 får punktet før bruddet ikke låne verdier etter det.
    expect(glidendeMedian([1, 1, 1, 1, 50, 50], 7, [4])).toEqual([1, 1, 1, 1, 50, 50])
    expect(glidendeMedian([1, 1, 1, 50, 50, 50], 7)[2]).toBe(50)
  })

  it('lar null være hull og regner bare med punktene i bevegelse', () => {
    expect(glidendeMedian([3, null, 3, 4, null], 3)).toEqual([3, null, 4, 4, null])
  })
})

// Sporfilene er ikke i git, så denne testen kjører bare lokalt.
const fil = resolve(__dirname, '../../../data/garmin_spor/24458795129.json')
describe.skipIf(!existsSync(fil))('ekte spor: 10 × 3 min med fire pauser', () => {
  it('finner pausene og legger rundene innenfor kurven', () => {
    const spor = JSON.parse(readFileSync(fil, 'utf-8')) as GarminSpor
    const b = bevegelsestid(spor.punkter.t)
    expect(b.pauser).toHaveLength(4)
    const slutt = b.x[b.x.length - 1]
    for (const r of spor.runder) {
      const x = b.tilBevegelse(r.start_s)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(slutt)
    }
    // Første runde (oppvarming) har klokketid uten pausene: den slutter der runde 2 starter.
    expect(Math.abs(b.tilBevegelse(spor.runder[1].start_s) - spor.runder[0].tid_s)).toBeLessThan(15)
  })
})
