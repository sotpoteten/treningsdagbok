import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { avledHelse, HRV_MIN_NETTER } from './helse'
import type { GarminAktivitet, GarminMaling } from './typer'

const les = (fil: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../data', fil), 'utf-8'))

const aktivitet = (dato: string, belastning: number | null): GarminAktivitet =>
  ({ garmin_id: 1, start_lokal: `${dato}T10:00:00`, belastning }) as GarminAktivitet

/** Datoene fra 1. jan. 2026 og n dager framover. */
const dag = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)

describe('belastning', () => {
  it('akutt er summen av 7 dager, kronisk snittet per uke over 28, og ACWR først når 28 dager er fylt', () => {
    // 10 i belastning hver dag i 35 dager.
    const h = avledHelse([], Array.from({ length: 35 }, (_, i) => aktivitet(dag(i), 10)))
    expect(h).toHaveLength(35)
    expect(h[0]).toMatchObject({ belastning_akutt: 10, belastning_kronisk: 3 })
    expect(h[0].acwr).toBeUndefined()
    expect(h[6].belastning_akutt).toBe(70)
    expect(h[27]).toMatchObject({ belastning_akutt: 70, belastning_kronisk: 70, acwr: 1 })
  })

  it('teller dager uten aktivitet som 0 og legger sammen flere aktiviteter samme dag', () => {
    // Dagene går til siste måling, så hvilepulsen dag 10 forlenger serien til belastningen er 0.
    const h = avledHelse([{ dato: dag(10), hvilepuls: 40 }], [aktivitet(dag(0), 30), aktivitet(dag(0), 20), aktivitet(dag(3), 50), aktivitet(dag(5), null)])
    expect(h.map((d) => d.belastning_akutt)).toEqual([50, 50, 50, 100, 100, 100, 100, 50, 50, 50, 0])
  })
})

describe('HRV', () => {
  it('normalområdet kommer først etter nok netter, og natta selv er ikke med', () => {
    const malinger: GarminMaling[] = Array.from({ length: HRV_MIN_NETTER + 1 }, (_, i) => ({ dato: dag(i), hrv_natt: i % 2 ? 60 : 40 }))
    const h = avledHelse(malinger, [])
    expect(h[HRV_MIN_NETTER - 1].hrv_normal_lav).toBeUndefined()
    const { hrv_normal_lav: lav, hrv_normal_hoy: hoy } = h[HRV_MIN_NETTER]
    // Geometrisk snitt av 40 og 60 er 49, og båndet ligger symmetrisk rundt det på log-skala.
    expect(lav! * hoy!).toBeCloseTo(40 * 60, -2)
    expect(lav).toBeLessThan(49)
    expect(hoy).toBeGreaterThan(49)
  })

  it('ukesnittet er snittet av de siste 7 nettene og trenger minst 3', () => {
    const h = avledHelse([{ dato: dag(0), hrv_natt: 50 }, { dato: dag(1), hrv_natt: 60 }, { dato: dag(2), hrv_natt: 70 }], [])
    expect(h[1].hrv_ukesnitt).toBeUndefined()
    expect(h[2].hrv_ukesnitt).toBe(60)
  })

  it('beholder målingene og fyller hull mellom dager med tomme dager', () => {
    const h = avledHelse([{ dato: dag(0), hvilepuls: 40, sovn_min: 480 }, { dato: dag(3), hvilepuls: 42 }], [])
    expect(h.map((d) => d.hvilepuls)).toEqual([40, undefined, undefined, 42])
    expect(h[0].sovn_min).toBe(480)
  })
})

describe('med dagbokas data', () => {
  const h = avledHelse(les('garmin_helse.json'), les('garmin_aktiviteter.json'))

  it('har én post per dag uten hull', () => {
    for (let i = 1; i < h.length; i++) expect(h[i].dato > h[i - 1].dato).toBe(true)
    const dager = (Date.parse(h.at(-1)!.dato) - Date.parse(h[0].dato)) / 864e5 + 1
    expect(h).toHaveLength(dager)
  })

  it('normalområdet og belastningen finnes fra slutten av 2023', () => {
    expect(h.find((d) => d.hrv_normal_lav != null)!.dato.slice(0, 4)).toBe('2023')
    expect(h.find((d) => d.acwr != null)!.dato.slice(0, 4)).toBe('2023')
    expect(h.filter((d) => d.dato >= '2024-01-01' && d.hrv_natt).every((d) => d.hrv_normal_lav! < d.hrv_normal_hoy!)).toBe(true)
  })
})
