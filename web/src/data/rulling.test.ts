import { describe, expect, it } from 'vitest'
import { hentPosisjoner, kanRulleTil, lagrePosisjoner, lagringsnokkel } from './rulling'

describe('rulleposisjoner', () => {
  it('tåler tomt og ødelagt lager', () => {
    expect(hentPosisjoner(null, 'a')).toBeNull()
    expect(hentPosisjoner('ikke json', 'a')).toBeNull()
    expect(hentPosisjoner('{"a":1}', 'a')).toBeNull()
    expect(JSON.parse(lagrePosisjoner('ikke json', 'a', { analyse: 10 }))).toEqual([['a', { analyse: 10 }]])
  })

  it('lagrer og henter per nøkkel', () => {
    let raw = lagrePosisjoner(null, 'a', { analyse: 120, 'tabell-sovn': 300 })
    raw = lagrePosisjoner(raw, 'b', { spor: 50 })
    expect(hentPosisjoner(raw, 'a')).toEqual({ analyse: 120, 'tabell-sovn': 300 })
    expect(hentPosisjoner(raw, 'b')).toEqual({ spor: 50 })
    expect(hentPosisjoner(raw, 'c')).toBeNull()
  })

  it('erstatter en nøkkel og flytter den sist', () => {
    let raw = lagrePosisjoner(null, 'a', { analyse: 1 })
    raw = lagrePosisjoner(raw, 'b', { analyse: 2 })
    raw = lagrePosisjoner(raw, 'a', { analyse: 3 })
    expect(JSON.parse(raw)).toEqual([
      ['b', { analyse: 2 }],
      ['a', { analyse: 3 }],
    ])
  })

  it('glemmer de eldste over taket', () => {
    let raw: string | null = null
    for (let i = 0; i < 5; i++) raw = lagrePosisjoner(raw, `k${i}`, { analyse: i }, 3)
    expect(hentPosisjoner(raw, 'k0')).toBeNull()
    expect(hentPosisjoner(raw, 'k1')).toBeNull()
    expect(hentPosisjoner(raw, 'k4')).toEqual({ analyse: 4 })
  })

  it('hopper over verdier som ikke er tall', () => {
    expect(hentPosisjoner('[["a",{"analyse":"x","spor":5}]]', 'a')).toEqual({ spor: 5 })
  })
})

describe('kanRulleTil', () => {
  it('krever at innholdet er høyt nok', () => {
    expect(kanRulleTil(1000, 600, 400)).toBe(true)
    expect(kanRulleTil(1000, 600, 401)).toBe(true) // én piksel avrunding
    expect(kanRulleTil(900, 600, 400)).toBe(false)
    expect(kanRulleTil(600, 600, 0)).toBe(true)
  })
})

describe('lagringsnokkel', () => {
  it('bruker location.key, og adressen for oppføringer uten egen nøkkel', () => {
    expect(lagringsnokkel('s0vl9kbz', '/analyse/helse')).toBe('s0vl9kbz')
    expect(lagringsnokkel('default', '/analyse/helse?tabell=sovn')).toBe('default:/analyse/helse?tabell=sovn')
  })
})
