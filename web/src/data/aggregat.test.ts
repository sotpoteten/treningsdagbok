import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { perAr, summer, summerEtter } from './aggregat'
import { byggDagbok } from './last'

const les = (fil: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../data', fil), 'utf-8'))
const dagbok = byggDagbok(les('okter.json'), les('dager.json'), les('uker.json'), les('profil.json'))

// Kontrolltall fra CLAUDE.md: [økter, timer, km]
const KONTROLL: Record<string, [number, number, number]> = {
  '2019': [86, 113, 399],
  '2020': [456, 550, 3138],
  '2021': [578, 734, 3052],
  '2022': [581, 690, 3626],
  '2023': [560, 659, 4163],
  '2024': [578, 634, 5006],
  '2025': [634, 730, 6152],
  '2026': [456, 519, 4051],
}

describe('summer per år', () => {
  const ar = summerEtter(dagbok.okter, perAr)
  for (const [aar, [okter, timer, km]] of Object.entries(KONTROLL)) {
    it(`${aar} stemmer med kontrolltallene`, () => {
      const s = ar.get(aar)!
      expect(s.okter).toBe(okter)
      expect(Math.round(s.minutter / 60)).toBe(timer)
      expect(Math.round(s.km)).toBe(km)
    })
  }

  it('totalen er om lag 4 630 t og 29 588 km', () => {
    const s = summer(dagbok.okter)
    expect(s.okter).toBe(3929)
    expect(Math.abs(s.minutter / 60 - 4630)).toBeLessThan(5)
    expect(Math.round(s.km)).toBe(29588)
  })

  it('o-teknikk legges ikke til i varigheten', () => {
    const s = summer(dagbok.okter)
    const sone = Object.values(s.sone).reduce((a, b) => a + b, 0)
    expect(s.minutter).toBe(sone + s.styrke)
  })
})

describe('uker', () => {
  it('starter med nyeste uke og har 7 dager hver', () => {
    expect(dagbok.uker[0].sondag >= dagbok.okter[dagbok.okter.length - 1].dato).toBe(true)
    expect(dagbok.uker.every((u) => u.dager.length === 7)).toBe(true)
  })

  it('følger ISO 8601: 2020 har uke 53, og uke 1 2021 starter 4. januar', () => {
    expect(dagbok.uker.some((u) => u.ar === 2020 && u.uke === 53)).toBe(true)
    expect(dagbok.uker.find((u) => u.ar === 2021 && u.uke === 1)?.mandag).toBe('2021-01-04')
  })

  it('hver økt havner i nøyaktig én uke', () => {
    expect(dagbok.uker.reduce((n, u) => n + u.okter.length, 0)).toBe(3929)
  })
})
