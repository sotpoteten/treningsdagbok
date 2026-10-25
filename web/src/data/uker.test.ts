import { describe, expect, it } from 'vitest'
import type { Dag, Okt, UkeRad } from './typer'
import { byggUker, isoDato, ukeForDato, ukeNokkel } from './uker'

const tom = () => [new Map<string, Okt[]>(), new Map<string, Dag>(), new Map<string, UkeRad>()] as const

describe('ISO-uker', () => {
  it('ukenøkkelen har to sifre for uka', () => {
    expect(ukeNokkel(2025, 1)).toBe('2025-01')
    expect(ukeNokkel(2020, 53)).toBe('2020-53')
  })

  it('årsskiftet følger ISO-uke-året, ikke kalenderåret', () => {
    expect(ukeForDato('2024-12-30')).toBe('2025-01')
    expect(ukeForDato('2025-01-01')).toBe('2025-01')
    expect(ukeForDato('2021-01-03')).toBe('2020-53')
    expect(ukeForDato('2021-01-04')).toBe('2021-01')
    expect(ukeForDato('2019-12-30')).toBe('2020-01')
    expect(ukeForDato('2023-01-01')).toBe('2022-52')
  })

  it('2020 har uke 53, men ikke 2019 og 2021', () => {
    expect(ukeForDato('2020-12-28')).toBe('2020-53')
    expect(ukeForDato('2019-12-29')).toBe('2019-52')
    expect(ukeForDato('2021-12-31')).toBe('2021-52')
  })

  it('uka slutter søndag og begynner mandag', () => {
    expect(ukeForDato('2026-10-04')).toBe('2026-40')
    expect(ukeForDato('2026-10-05')).toBe('2026-41')
  })

  it('isoDato bruker lokal dato', () => {
    expect(isoDato(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(isoDato(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})

describe('byggUker', () => {
  it('gir hele uker, nyeste først, også over uke 53', () => {
    const uker = byggUker('2020-12-23', '2021-01-05', ...tom())
    expect(uker.map((u) => u.nokkel)).toEqual(['2021-01', '2020-53', '2020-52'])
    const u53 = uker[1]
    expect([u53.ar, u53.uke, u53.mandag, u53.sondag]).toEqual([2020, 53, '2020-12-28', '2021-01-03'])
    expect(u53.dager.map((d) => d.dato)).toEqual([
      '2020-12-28', '2020-12-29', '2020-12-30', '2020-12-31', '2021-01-01', '2021-01-02', '2021-01-03',
    ])
  })

  it('tar med tomme uker og legger økter, rapporter og kommentarer på riktig dag og uke', () => {
    const [okter, dager, kommentarer] = tom()
    const okt = { id: 'a', dato: '2025-01-01' } as Okt
    okter.set('2025-01-01', [okt])
    dager.set('2024-12-31', { dato: '2024-12-31', syk: true } as Dag)
    kommentarer.set('2025-01', { ar: 2025, uke: 1, mandag: '2024-12-30', kommentarer: [{ tekst: 'Nyttår', skrevet: '2025-01-05', egen: true }] })
    const uker = byggUker('2024-12-20', '2025-01-08', okter, dager, kommentarer)
    expect(uker.map((u) => u.nokkel)).toEqual(['2025-02', '2025-01', '2024-52', '2024-51'])
    const u1 = uker[1]
    expect(u1.okter).toEqual([okt])
    expect(u1.dager[2].okter).toEqual([okt])
    expect(u1.dager[1].rapport?.syk).toBe(true)
    expect(u1.kommentarer.map((k) => k.tekst)).toEqual(['Nyttår'])
    expect(uker[0].okter).toEqual([])
    expect(uker[0].dager.every((d) => d.rapport === null)).toBe(true)
  })
})
