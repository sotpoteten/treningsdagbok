import { describe, expect, it } from 'vitest'
import { lesListe, lesVerdi, medIListe, medVerdi } from './urltilstand'

const p = (s: string) => new URLSearchParams(s)

describe('lesVerdi', () => {
  it('gir standard når nøkkelen mangler eller er tom', () => {
    expect(lesVerdi(p(''), 'periode', 'sesong')).toBe('sesong')
    expect(lesVerdi(p('periode='), 'periode', 'sesong')).toBe('sesong')
  })
  it('leser verdien', () => {
    expect(lesVerdi(p('sesong=2025-26&periode=alle'), 'periode', 'sesong')).toBe('alle')
  })
  it('avviser ugyldige verdier når gyldige er oppgitt', () => {
    expect(lesVerdi(p('periode=tull'), 'periode', 'sesong', ['sesong', 'alle'])).toBe('sesong')
    expect(lesVerdi(p('periode=alle'), 'periode', 'sesong', ['sesong', 'alle'])).toBe('alle')
  })
  it('æøå overlever en rundtur', () => {
    expect(lesVerdi(p(`type=${encodeURIComponent('ski-o')}`), 'type', 'o-løp')).toBe('ski-o')
    expect(lesVerdi(medVerdi(p(''), 'type', 'o-løp', 'ski-o'), 'type', 'ski-o')).toBe('o-løp')
  })
})

describe('medVerdi', () => {
  it('utelater standardverdien', () => {
    expect(medVerdi(p('periode=alle&sesong=2025-26'), 'periode', 'sesong', 'sesong').toString()).toBe('sesong=2025-26')
  })
  it('setter andre verdier og beholder resten', () => {
    expect(medVerdi(p('sesong=2025-26'), 'periode', 'alle', 'sesong').toString()).toBe('sesong=2025-26&periode=alle')
  })
  it('endrer ikke parametrene den får', () => {
    const fra = p('a=1')
    medVerdi(fra, 'a', '2', '0')
    expect(fra.toString()).toBe('a=1')
  })
})

describe('lister', () => {
  it('leser kommaseparert liste', () => {
    expect(lesListe(p(''), 'tabell')).toEqual([])
    expect(lesListe(p('tabell=sovn,hvilepuls'), 'tabell')).toEqual(['sovn', 'hvilepuls'])
  })
  it('legger til uten duplikater og fjerner tom liste', () => {
    let q = medIListe(p('sesong=2025-26'), 'tabell', 'sovn', true)
    expect(q.get('tabell')).toBe('sovn')
    q = medIListe(q, 'tabell', 'sovn', true)
    expect(q.get('tabell')).toBe('sovn')
    q = medIListe(q, 'tabell', 'hrv', true)
    expect(lesListe(q, 'tabell')).toEqual(['sovn', 'hrv'])
    q = medIListe(q, 'tabell', 'sovn', false)
    q = medIListe(q, 'tabell', 'hrv', false)
    expect(q.toString()).toBe('sesong=2025-26')
  })
})
