import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  disiplinerIBruk,
  disiplinTekst,
  filtrer,
  klokke,
  OPPKJORING_DAGER,
  oppkjoring,
  plassTekst,
  prosent,
  snittOppkjoring,
  typerIBruk,
} from './konkurranser'
import { byggDagbok } from './last'
import type { Konkurranse, Konkurranser, Okt, Profil } from './typer'

const fil = (navn: string) => resolve(__dirname, '../../../data', navn)
const les = (navn: string) => JSON.parse(readFileSync(fil(navn), 'utf-8'))

/** Et løp med bare feltene testen trenger. */
const lop = (dato: string, f: Partial<Konkurranse> = {}): Konkurranse =>
  ({
    eventor_id: Number(dato.replace(/-/g, '')),
    dato,
    navn: 'Testløp',
    type: 'o-løp',
    disiplin: 'mellom',
    natt: false,
    status: 'OK',
    plass: 3,
    antall: 40,
    prosent_bak: 5,
    okt_ider: [],
    ...f,
  }) as Konkurranse

const okt = (id: string, dato: string, sone: Okt['sone_min']): Okt => {
  const min = Object.values(sone).reduce((a, b) => a + b, 0)
  return {
    id,
    dato,
    rekkefolge: 0,
    navn: 'Økt',
    beskrivelse: null,
    kommentar: null,
    kommentarer_andre: [],
    varighet_min: min,
    hoyeste_sone: null,
    hoyeste_sone_registrert: null,
    sone_min: sone,
    distanse_km: 10,
    loping_min: min,
    otek_min: 0,
    styrke_min: 0,
    opplevd_belastning: null,
    dagsform: null,
    blokker: [],
  }
}

describe('utvalg', () => {
  const liste = [
    lop('2025-04-01', { disiplin: 'sprint' }),
    lop('2025-05-01', { type: 'ski-o', disiplin: 'lang' }),
    lop('2025-06-01', { disiplin: 'lang', natt: true }),
    lop('2025-12-01', { type: 'pre-o', disiplin: 'tempo' }),
  ]

  it('filtrerer på type, disiplin og tidsrom', () => {
    expect(filtrer(liste, { type: 'o-løp' })).toHaveLength(2)
    expect(filtrer(liste, { disiplin: 'lang' })).toHaveLength(2)
    expect(filtrer(liste, { type: 'o-løp', disiplin: 'lang' }).map((k) => k.dato)).toEqual(['2025-06-01'])
    expect(filtrer(liste, { fra: '2025-05-01', til: '2025-11-30' }).map((k) => k.dato)).toEqual(['2025-05-01', '2025-06-01'])
  })

  it('lister typer og disipliner i fast rekkefølge', () => {
    expect(typerIBruk(liste)).toEqual(['o-løp', 'ski-o', 'pre-o'])
    expect(disiplinerIBruk(liste)).toEqual(['sprint', 'lang', 'tempo'])
  })

  it('formaterer tider og resultater', () => {
    expect(klokke(3442)).toBe('57:22')
    expect(klokke(3903)).toBe('1:05:03')
    expect(prosent(10.2)).toBe('10,2 %')
    expect(prosent(null)).toBe('–')
    expect(plassTekst({ plass: 1, antall: 98, status: 'OK' })).toBe('1 av 98')
    expect(plassTekst({ plass: null, antall: 50, status: 'DNF' })).toBe('DNF')
    expect(disiplinTekst({ disiplin: 'lang', natt: true })).toBe('Lang · natt')
  })
})

describe('oppkjøring', () => {
  const profil = les('profil.json') as Profil
  const okter = [
    okt('a', '2025-03-07', { I1: 60 }), // 21 dager før: med
    okt('b', '2025-03-20', { I1: 30, I4: 20 }), // kvalitetsøkt
    okt('c', '2025-03-27', { I1: 40, I3: 5 }), // dagen før
    okt('d', '2025-03-28', { I1: 20, I5: 30 }), // løpsdagen: ikke med
    okt('e', '2025-03-06', { I1: 90 }), // 22 dager før: ikke med
  ]
  const dagbok = byggDagbok(
    okter,
    [
      { dato: '2025-03-10', syk: true, skadet: false, reise: false, hoyde: false, fridag: false, konkurranse: false, notat: null, sykdom: null, skade: null },
    ],
    [],
    profil,
    [],
    [
      { dato: '2025-03-10', hvilepuls: 40, hrv_natt: 100 },
      { dato: '2025-03-27', hvilepuls: 44, hrv_natt: 80 },
      { dato: '2025-03-28', hvilepuls: 60, hrv_natt: 20 },
    ],
    null,
    { individuelle: [lop('2025-03-28'), lop('2025-03-15'), lop('2025-03-01')], stafett: [] },
  )

  it('summerer de 21 dagene før løpet, uten løpsdagen', () => {
    const o = oppkjoring(dagbok, '2025-03-28')
    expect(OPPKJORING_DAGER).toBe(21)
    expect(o.fra).toBe('2025-03-07')
    expect(o.til).toBe('2025-03-27')
    expect(o.okter).toBe(3)
    expect(o.minutter).toBe(155)
    expect(o.harde_min).toBe(25)
    expect(o.kvalitetsokter).toBe(1)
    expect(o.konkurranser).toBe(1)
    expect(o.sykedager).toBe(1)
    expect(o.hvilepuls).toBe(42)
    expect(o.hrv).toBe(90)
    expect(o.belastning_akutt).toBeNull()
  })

  it('snittet hopper over løp uten måling', () => {
    const a = oppkjoring(dagbok, '2025-03-28')
    const b = oppkjoring(dagbok, '2025-03-01')
    const s = snittOppkjoring([a, b])
    expect(b.hvilepuls).toBeNull()
    expect(s.hvilepuls).toBe(42)
    expect(s.minutter).toBe((a.minutter + b.minutter) / 2)
  })

  it('løpene sorteres kronologisk og kobles til øktene', () => {
    expect(dagbok.konkurranser.map((k) => k.dato)).toEqual(['2025-03-01', '2025-03-15', '2025-03-28'])
  })
})

describe.skipIf(!existsSync(fil('konkurranser.json')))('konkurranser.json', () => {
  const data = les('konkurranser.json') as Konkurranser
  const dagbok = byggDagbok(les('okter.json'), les('dager.json'), les('uker.json'), les('profil.json'), [], [], null, data)

  it('NM natt 2025 er koblet til økta og har strekkfart', () => {
    const nm = dagbok.konkurranser.find((k) => k.eventor_id === 19373)!
    expect(nm).toMatchObject({ dato: '2025-03-28', plass: 1, prosent_bak: 0, disiplin: 'lang', natt: true })
    expect(nm.okt_ider.length).toBeGreaterThan(0)
    for (const id of nm.okt_ider) {
      expect(dagbok.oktPerId.get(id)?.dato).toBe('2025-03-28')
      expect(dagbok.konkurransePerOkt.get(id)).toContain(nm)
    }
  })

  it('pre-o holdes for seg: tempO er ikke med i o-løp', () => {
    const o = filtrer(dagbok.konkurranser, { type: 'o-løp' })
    expect(o.some((k) => k.disiplin === 'tempo')).toBe(false)
    expect(filtrer(dagbok.konkurranser, { type: 'pre-o' }).every((k) => k.disiplin === 'tempo')).toBe(true)
  })

  it('har ingen navnefelt for andre løpere', () => {
    const tekst = JSON.stringify(data)
    expect(tekst).not.toMatch(/"(Given|Family|PersonName|BirthDate|navn_lopere|person)"/i)
  })
})
