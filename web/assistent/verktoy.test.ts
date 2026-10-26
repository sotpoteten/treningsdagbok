import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { summer } from '../src/data/aggregat'
import { lagTreff } from '../src/data/filter'
import { lagSesong, okterISesong } from '../src/data/statistikk'
import { lagRundeleser, lesDagbok } from './data'
import { dager, finnOkter, konkurranser, MAKS_DAGER, MAKS_KONKURRANSER, okt, perioder, sesongoversikt, ukekommentarer, Verktoyfeil } from './verktoy'

const DATA = resolve(__dirname, '../../data')
const dagbok = lesDagbok(DATA)

describe('perioder', () => {
  it('kalenderåret 2025 stemmer med kontrolltallene', () => {
    const { rader } = perioder(dagbok, { fra: '2025-01-01', til: '2025-12-31', opplosning: 'ar' })
    expect(rader).toHaveLength(1)
    expect(rader[0].okter).toBe(634)
    expect(Math.round(rader[0].timer)).toBe(730)
    expect(Math.round(rader[0].km)).toBe(6152)
  })

  it('måneder og uker summerer til det samme som året', () => {
    const maneder = perioder(dagbok, { fra: '2025-01-01', til: '2025-12-31', opplosning: 'maned' }).rader
    expect(maneder).toHaveLength(12)
    expect(maneder.reduce((s, r) => s + r.okter, 0)).toBe(634)
    // 2025 uke 2–5 er hele uker: 6. jan.–2. feb.
    const uker = perioder(dagbok, { fra: '2025-01-08', til: '2025-01-28', opplosning: 'uke' }).rader
    expect(uker.map((u) => u.periode)).toEqual(['2025-02', '2025-03', '2025-04', '2025-05'])
    expect(uker[0].fra).toBe('2025-01-06')
  })

  it('en sesongrad stemmer med analysens sesong', () => {
    const s = lagSesong(2024)
    const fasit = summer(okterISesong(dagbok.okter, s))
    const [rad] = perioder(dagbok, { fra: s.fra, til: s.til, opplosning: 'sesong' }).rader
    expect(rad.periode).toBe('2024/25')
    expect(rad.okter).toBe(fasit.okter)
    expect(rad.sone_min).toEqual(fasit.sone)
    expect(rad.loping_min + rad.ski_min + rad.sykkel_annet_min + rad.styrke_min).toBe(fasit.minutter)
  })

  it('sier fra når det blir for mange rader', () => {
    expect(() => perioder(dagbok, { fra: '2019-11-01', til: '2026-10-05', opplosning: 'uke' })).toThrow(Verktoyfeil)
  })

  it('sesongoversikten dekker alle økter', () => {
    expect(sesongoversikt(dagbok).reduce((s, r) => s + r.okter, 0)).toBe(dagbok.okter.length)
  })
})

describe('finn_okter', () => {
  it('treffer som søket i dagboka', () => {
    const treff = lagTreff({ sok: 'NM', typer: new Set() }, dagbok.dagerPerDato)
    const svar = finnOkter(dagbok, { sok: 'NM', antall: 5 })
    expect(svar.antall_treff).toBe(dagbok.okter.filter(treff).length)
    expect(svar.okter).toHaveLength(5)
    expect(svar.okter[0].dato >= svar.okter[4].dato).toBe(true)
  })

  it('sorterer på harde minutter', () => {
    const svar = finnOkter(dagbok, { sorter: 'mest_hardt', antall: 3, fra: '2025-01-01', til: '2025-12-31' })
    const harde = svar.okter.map((o) => (o.sone_min.I3 ?? 0) + (o.sone_min.I4 ?? 0) + (o.sone_min.I5 ?? 0))
    expect(harde[0]).toBeGreaterThanOrEqual(harde[1])
    expect(harde[1]).toBeGreaterThanOrEqual(harde[2])
  })
})

describe('okt', () => {
  it('gir Garmin-data og runder, men aldri koordinater', () => {
    const lesRunder = lagRundeleser(DATA)
    const medSpor = dagbok.garmin.filter((g) => g.okt_id && g.har_spor).slice(-40)
    for (const g of medSpor) {
      const tekst = JSON.stringify(okt(dagbok, { id: g.okt_id! }, lesRunder))
      expect(tekst).not.toMatch(/"(lat|lon|punkter)"/)
    }
    const svar = okt(dagbok, { id: medSpor[0].okt_id! }, () => [{ start_s: 0, tid_s: 300, dist_m: 1000, puls: 170, makspuls: 180, fart: 1000 / 300 }])
    expect(svar.garmin.length).toBeGreaterThan(0)
    expect(svar.garmin.find((g) => g.runder)?.runder?.[0]).toMatchObject({ tid_s: 300, tempo_min_km: 5 })
  })

  it('gir runder uten distanse og tempo når økta mangler GPS', () => {
    const utenGps = dagbok.garmin.find((g) => g.okt_id && !g.har_spor && g.har_kurver)
    if (!utenGps) return
    const svar = okt(dagbok, { id: utenGps.okt_id! }, () => [{ start_s: 0, tid_s: 300, dist_m: 1000, puls: 150, makspuls: 160, fart: 1000 / 300 }])
    const runde = svar.garmin.find((g) => g.start === utenGps.start_lokal)?.runder?.[0]
    expect(runde).toEqual({ tid_s: 300, snittpuls: 150, makspuls: 160 })
  })

  it('sier fra om ukjent id', () => {
    expect(() => okt(dagbok, { id: 'finnes-ikke' })).toThrow(Verktoyfeil)
  })
})

describe('dager og ukeskommentarer', () => {
  it('gir én rad per dag med økter og helse', () => {
    const rader = dager(dagbok, { fra: '2026-10-01', til: '2026-10-05' })
    expect(rader).toHaveLength(5)
    expect(rader[0].ukedag).toBe('tor')
    expect(rader.flatMap((r) => r.okter).length).toBe(dagbok.okter.filter((o) => o.dato >= '2026-10-01' && o.dato <= '2026-10-05').length)
    expect(() => dager(dagbok, { fra: '2026-01-01', til: '2026-10-05' })).toThrow(`maks ${MAKS_DAGER}`)
  })

  it('finner ukeskommentarer i et tidsrom', () => {
    const svar = ukekommentarer(dagbok, { fra: '2019-10-28', til: '2019-11-10' })
    expect(svar.uker.map((u) => u.uke)).toEqual(['2019-45', '2019-44'])
    expect(svar.uker[1].kommentarer[0]).toContain('Totalt sett grei uke')
  })
})

describe('konkurranser', () => {
  it('finner NM natt 2025 med strekk, oppkjøring og kobling til økta', () => {
    const svar = konkurranser(dagbok, { fra: '2025-03-28', til: '2025-03-28', eventor_id: 19373 })
    expect(svar.antall_treff).toBe(1)
    const [nm] = svar.lop
    expect(nm).toMatchObject({ navn: 'NM natt', plass: 1, antall: 98, prosent_bak: 0, disiplin: 'lang', natt: true, uke: '2025-13' })
    expect(nm.strekk?.length).toBe(nm.antall_strekk)
    expect(nm.oppkjoring_21d.timer).toBeGreaterThan(0)
    // Samme resultat ligger på økta.
    const o = okt(dagbok, { id: nm.okt_ider[0] })
    expect(o.resultat.map((r) => r.eventor_id)).toContain(19373)
  })

  it('filtrerer på type og disiplin, og holder pre-o for seg', () => {
    const alle = konkurranser(dagbok, { fra: '2019-11-01', til: '2026-10-31', type: 'o-løp' })
    expect(alle.antall_treff).toBe(dagbok.konkurranser.filter((k) => k.type === 'o-løp').length)
    expect(alle.viser).toBe(Math.min(alle.antall_treff, MAKS_KONKURRANSER))
    expect(alle.lop.every((k) => k.type === 'o-løp' && k.disiplin !== 'tempo')).toBe(true)
    expect(alle.stafett).toBeUndefined()
    const sprint = konkurranser(dagbok, { fra: '2024-11-01', til: '2025-10-31', type: 'o-løp', disiplin: 'sprint' })
    expect(sprint.lop.every((k) => k.disiplin === 'sprint')).toBe(true)
    // Uten strekk i lista, så svaret holder seg lite.
    expect(sprint.lop.every((k) => k.strekk === undefined)).toBe(true)
  })

  it('tar med stafettene uten filter, og bare egne felt', () => {
    const svar = konkurranser(dagbok, { fra: '2019-11-01', til: '2026-10-31' })
    expect(svar.stafett?.length).toBe(dagbok.stafetter.length)
    expect(JSON.stringify(svar)).not.toMatch(/"(Given|Family|PersonName|BirthDate|lat|lon)"/)
  })

  it('sier fra om ugyldige datoer', () => {
    expect(() => konkurranser(dagbok, { fra: '2025-03-01', til: '2025-01-01' })).toThrow(Verktoyfeil)
  })
})
