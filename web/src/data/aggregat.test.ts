import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { perAr, summer, summerEtter } from './aggregat'
import { byggDagbok } from './last'

const les = (fil: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../data', fil), 'utf-8'))
const dagbok = byggDagbok(les('okter.json'), les('dager.json'), les('uker.json'), les('profil.json'))

// Kontrolltall fra CLAUDE.md for avsluttede år: [økter, timer, km]. Året som pågår vokser
// ved hver import og sjekkes bare mot det som var importert 5. okt. 2026.
const KONTROLL: Record<string, [number, number, number]> = {
  '2019': [86, 113, 399],
  '2020': [456, 550, 3138],
  '2021': [578, 734, 3052],
  '2022': [581, 690, 3626],
  '2023': [560, 659, 4163],
  '2024': [578, 634, 5006],
  '2025': [634, 730, 6152],
}
const AR_2026_MINST: [number, number, number] = [456, 519, 4051]

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

  it('2026 har minst det som var importert 5. okt.', () => {
    const s = ar.get('2026')!
    expect(s.okter).toBeGreaterThanOrEqual(AR_2026_MINST[0])
    expect(Math.round(s.minutter / 60)).toBeGreaterThanOrEqual(AR_2026_MINST[1])
    expect(Math.round(s.km)).toBeGreaterThanOrEqual(AR_2026_MINST[2])
  })

  it('totalen er summen av årene', () => {
    const s = summer(dagbok.okter)
    expect(s.okter).toBe(dagbok.okter.length)
    expect(s.okter).toBe([...ar.values()].reduce((a, x) => a + x.okter, 0))
    expect(s.minutter).toBe([...ar.values()].reduce((a, x) => a + x.minutter, 0))
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
    expect(dagbok.uker.reduce((n, u) => n + u.okter.length, 0)).toBe(dagbok.okter.length)
  })
})
