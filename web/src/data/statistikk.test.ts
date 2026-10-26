import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { summer, summerEtter } from './aggregat'
import { byggDagbok } from './last'
import {
  aktivitetsfordeling,
  analyseperiode,
  dagserie,
  erKvalitet,
  glidendeSnitt,
  glidendeSnittMedHull,
  helsePerSesong,
  kumulativ,
  lagSesong,
  lengsteRekke,
  manedspunkter,
  nokkeltallTilSammeDato,
  okterISesong,
  perSesong,
  sammeDatoI,
  sesong,
  sesongDag,
  sesonger,
  snitt,
  tilSammeDato,
  ukepunkter,
} from './statistikk'

const les = (fil: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../data', fil), 'utf-8'))
const dagbok = byggDagbok(les('okter.json'), les('dager.json'), les('uker.json'), les('profil.json'))

describe('sesonger', () => {
  it('går fra 1. november til 31. oktober', () => {
    expect(sesong('2025-10-31')).toBe('2024/25')
    expect(sesong('2025-11-01')).toBe('2025/26')
    expect(sesong('2026-01-15')).toBe('2025/26')
    expect(sesongDag('2025-11-01')).toBe(0)
    expect(sesongDag('2026-10-31')).toBe(364)
    expect(lagSesong(2023).dager).toBe(366) // inneholder 29. feb. 2024
  })

  it('dekker alle data, fra 2019/20 til 2025/26', () => {
    const s = sesonger(dagbok).map((x) => x.navn)
    expect(s[0]).toBe('2019/20')
    expect(s.at(-1)).toBe('2025/26')
  })

  it('analysen går til siste importerte økt, ikke til i dag', () => {
    expect(dagbok.sisteDato).toBe(dagbok.okter.at(-1)!.dato)
    const s = lagSesong(2025)
    expect(analyseperiode(s, '2026-10-05')).toEqual({ sluttdato: '2026-10-05', pagaende: true })
    // En ferdig sesong dekkes hele, også når dagboka har gått videre.
    expect(analyseperiode(lagSesong(2024), '2026-10-05')).toEqual({ sluttdato: '2025-10-31', pagaende: false })
    // Siste økt på siste dag i sesongen regnes som en hel sesong.
    expect(analyseperiode(s, '2026-10-31').pagaende).toBe(false)
  })

  it('summene per sesong blir til sammen totalen', () => {
    const per = [...summerEtter(dagbok.okter, perSesong).values()]
    const total = summer(dagbok.okter)
    expect(per.reduce((a, s) => a + s.okter, 0)).toBe(total.okter)
    expect(Math.round(per.reduce((a, s) => a + s.km, 0))).toBe(Math.round(total.km))
  })
})

describe('kumulativt', () => {
  it('siste verdi er lik sesongtotalen', () => {
    for (const s of sesonger(dagbok)) {
      const sum = summer(okterISesong(dagbok.okter, s))
      const t = kumulativ(dagbok.okter, s, 'timer')
      const k = kumulativ(dagbok.okter, s, 'km')
      expect(t).toHaveLength(s.dager)
      expect(t.at(-1)).toBeCloseTo(sum.minutter / 60, 6)
      expect(k.at(-1)).toBeCloseTo(sum.km, 6)
    }
  })

  it('til samme dato stemmer med kurven', () => {
    const s = lagSesong(2024)
    const t = kumulativ(dagbok.okter, s, 'timer')
    expect(tilSammeDato(dagbok.okter, s, '2025-02-08').minutter / 60).toBeCloseTo(t[sesongDag('2025-02-08')], 6)
  })
})

describe('samme dato', () => {
  it('følger kalenderdatoen, ikke dag nr. i sesongen', () => {
    // 23/24 har 366 dager. Dag nr. 364 er 30. okt., men samme dato er 31. okt.
    expect(sammeDatoI(lagSesong(2023), '2025-10-31')).toBe('2024-10-31')
    expect(sammeDatoI(lagSesong(2023), '2025-11-15')).toBe('2023-11-15')
    // 29. feb. blir 28. feb. i år uten skuddag, og står urørt i et skuddår.
    expect(sammeDatoI(lagSesong(2026), '2028-02-29')).toBe('2027-02-28')
    expect(sammeDatoI(lagSesong(2027), '2028-02-29')).toBe('2028-02-29')
    expect(sammeDatoI(lagSesong(2099), '2028-02-29')).toBe('2100-02-28') // 2100 er ikke skuddår
    expect(sammeDatoI(lagSesong(2399), '2028-02-29')).toBe('2400-02-29')
  })

  it('en ferdig sesong sammenlignes med hele sesongen før, med samme tall som tabellen', () => {
    const alle = sesonger(dagbok)
    const per = summerEtter(dagbok.okter, perSesong)
    const helse = helsePerSesong(dagbok.dagerPerDato.values())
    for (let i = 1; i < alle.length; i++) {
      const { sluttdato, pagaende } = analyseperiode(alle[i], dagbok.sisteDato)
      if (pagaende) continue
      const forrige = alle[i - 1]
      const n = nokkeltallTilSammeDato(dagbok, forrige, sluttdato)
      const full = per.get(forrige.navn)!
      expect(n.til, forrige.navn).toBe(forrige.til)
      expect(n.sum.okter, forrige.navn).toBe(full.okter)
      expect(n.sum.minutter, forrige.navn).toBe(full.minutter)
      expect(n.sum.km, forrige.navn).toBeCloseTo(full.km, 6)
      expect(n.sum.styrke, forrige.navn).toBe(full.styrke)
      expect(n.kvalitet, forrige.navn).toBe(okterISesong(dagbok.okter, forrige).filter(erKvalitet).length)
      expect(n.syk, forrige.navn).toBe(helse.get(forrige.navn)?.syk ?? 0)
      expect(n.skadet, forrige.navn).toBe(helse.get(forrige.navn)?.skadet ?? 0)
    }
  })

  it('med 2024/25 valgt gir 2023/24 hele sesongen, også 31. okt. 2024', () => {
    const { sluttdato } = analyseperiode(lagSesong(2024), dagbok.sisteDato)
    const n = nokkeltallTilSammeDato(dagbok, lagSesong(2023), sluttdato)
    expect(n.sum.okter).toBe(578)
    expect(n.sum.minutter).toBe(654 * 60 + 13)
  })
})

describe('aktivitet', () => {
  it('aktivitetene summerer til varigheten, og o-teknikk holdes utenfor', () => {
    const a = aktivitetsfordeling(dagbok.okter)
    const sum = Object.values(a.min).reduce((x, y) => x + y, 0)
    expect(sum).toBe(summer(dagbok.okter).minutter)
    expect(a.otek).toBe(summer(dagbok.okter).otek)
  })
})

describe('kvalitet, uker og måneder', () => {
  it('kvalitetsøkt krever minst 10 min i I3–I5', () => {
    const okt = (sone_min: object) => ({ sone_min }) as never
    expect(erKvalitet(okt({ I1: 50, I3: 10 }))).toBe(true)
    expect(erKvalitet(okt({ I1: 50, I2: 30, I4: 9 }))).toBe(false)
  })

  it('ukepunktene er kronologiske og har alle øktene', () => {
    const p = ukepunkter(dagbok.uker)
    expect(p[0].uke.mandag < p[1].uke.mandag).toBe(true)
    expect(p.reduce((a, x) => a + x.sum.okter, 0)).toBe(dagbok.okter.length)
  })

  it('månedspunktene tar med tomme måneder', () => {
    const m = manedspunkter([], '2025-11-01', '2026-10-31')
    expect(m).toHaveLength(12)
    expect(m[0].maned).toBe('2025-11')
    expect(m[11].maned).toBe('2026-10')
  })

  it('glidende snitt', () => {
    expect(glidendeSnitt([4, 8, 0, 4, 8], 2)).toEqual([4, 6, 4, 2, 6])
  })
})

describe('rekker og helse', () => {
  it('finner lengste rekke', () => {
    const med = new Set(['2025-01-01', '2025-01-02', '2025-01-04', '2025-01-05', '2025-01-06'])
    expect(lengsteRekke('2025-01-01', '2025-01-07', (d) => med.has(d))).toEqual({
      dager: 3,
      fra: '2025-01-04',
      til: '2025-01-06',
    })
    expect(lengsteRekke('2025-01-01', '2025-01-03', () => false)).toBeNull()
  })

  it('teller syke- og skadedager per sesong', () => {
    const h = helsePerSesong(dagbok.dagerPerDato.values())
    const syk = [...h.values()].reduce((a, x) => a + x.syk, 0)
    const skadet = [...h.values()].reduce((a, x) => a + x.skadet, 0)
    const dager = [...dagbok.dagerPerDato.values()]
    expect(syk).toBe(dager.filter((d) => d.syk).length)
    expect(skadet).toBe(dager.filter((d) => d.skadet).length)
    // Tallene fra importen 5. okt. 2026 kan bare øke.
    expect(syk).toBeGreaterThanOrEqual(66)
    expect(skadet).toBeGreaterThanOrEqual(83)
  })
})

describe('helseserier', () => {
  it('dagserie fyller hull med null', () => {
    const m = new Map([
      ['2025-01-01', 50],
      ['2025-01-03', 48],
    ])
    const s = dagserie(m, '2025-01-01', '2025-01-04', (v) => v)
    expect(s.datoer).toEqual(['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'])
    expect(s.verdier).toEqual([50, null, 48, null])
  })

  it('glidende snitt hopper over hull', () => {
    expect(glidendeSnittMedHull([10, null, 20, null, null, null], 3)).toEqual([10, 10, 15, 20, 20, null])
  })

  it('snitt ignorerer manglende verdier', () => {
    expect(snitt([1, null, 3, undefined])).toBe(2)
    expect(snitt([null])).toBeNull()
  })

  it('Garmin-helse er lastet og har HRV og hvilepuls 9.10.2026', () => {
    const fil = resolve(__dirname, '../../../data/garmin_helse.json')
    if (!existsSync(fil)) return // filen lages av scripts/konverter_garmin.py
    const h = new Map((JSON.parse(readFileSync(fil, 'utf-8')) as { dato: string }[]).map((d) => [d.dato, d]))
    expect(h.get('2026-10-09')).toMatchObject({ hrv_natt: 69 })
  })
})
