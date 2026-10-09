import { describe, expect, it } from 'vitest'
import { lagTreff, lesFilter } from './filter'
import type { Okt } from './typer'

const okt = (navn: string, kommentar: string, aktivitet_id = 2): Okt =>
  ({ navn, kommentar, beskrivelse: null, dato: '2025-06-01', blokker: [{ aktivitet_id }] }) as unknown as Okt

const treff = (q: string) => lagTreff(lesFilter(new URLSearchParams(q)), new Map())

describe('søk', () => {
  it('treffer begynnelsen av ord, ikke midt i dem', () => {
    expect(treff('q=NM')(okt('NM-sprint', ''))).toBe(true)
    expect(treff('q=NM')(okt('Jogg', 'Godt gjennomført'))).toBe(false)
    expect(treff('q=sjusj')(okt('Jogg', 'Rolig tur på Sjusjøen.'))).toBe(true)
  })

  it('krever alle ord og tåler spesialtegn', () => {
    expect(treff('q=rolig+sjusjøen')(okt('Jogg', 'Rolig tur på Sjusjøen.'))).toBe(true)
    expect(treff('q=rolig+hytta')(okt('Jogg', 'Rolig tur på Sjusjøen.'))).toBe(false)
    expect(() => treff('q=6+x+(5')(okt('6 x 5 min', ''))).not.toThrow()
  })

  it('filtrerer på type', () => {
    expect(treff('type=ski')(okt('Langtur', '', 5))).toBe(true)
    expect(treff('type=ski')(okt('Jogg', '', 2))).toBe(false)
  })
})
