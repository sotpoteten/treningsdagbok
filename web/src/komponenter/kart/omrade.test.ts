import { describe, expect, it } from 'vitest'
import { iNorge, land, midtpunkt } from './omrade'

describe('iNorge', () => {
  it('kjenner igjen steder i Norge', () => {
    for (const [lat, lon] of [
      [59.95, 10.75], // Sognsvann
      [63.42, 10.4], // Trondheim
      [60.5, 10.6], // NM langdistanse 2025
      [58.9, 5.7], // Stavanger
      [69.65, 18.95], // Tromsø
    ])
      expect(iNorge(lat, lon)).toBe(true)
  })

  it('kjenner igjen steder utenfor', () => {
    for (const [lat, lon] of [
      [60.6, 15.6], // Falun
      [61.2, 14.0], // Älvdalen
      [62.9, 27.7], // Kuopio
      [59.33, 18.07], // Stockholm
      [55.7, 12.6], // København
    ])
      expect(iNorge(lat, lon)).toBe(false)
  })
})

describe('land', () => {
  it('kjenner igjen steder i Finland', () => {
    for (const [lat, lon] of [
      [60.17, 24.94], // Helsingfors
      [62.9, 27.7], // Kuopio
      [62.24, 25.75], // Jyväskylä
      [60.45, 22.27], // Åbo
      [60.1, 19.94], // Mariehamn
      [63.1, 21.6], // Vasa
      [65.0, 25.47], // Oulu
      [66.5, 25.7], // Rovaniemi
    ])
      expect(land(lat, lon)).toBe('finland')
  })

  it('skiller Finland fra nabolandene', () => {
    expect(land(63.42, 10.4)).toBe('norge') // Trondheim
    expect(land(69.97, 23.27)).toBe('norge') // Alta
    for (const [lat, lon] of [
      [63.83, 20.26], // Umeå
      [65.58, 22.15], // Luleå
      [67.85, 20.22], // Kiruna
      [59.44, 24.75], // Tallinn
      [60.71, 28.75], // Vyborg
      [46.95, 7.45], // Bern
    ])
      expect(land(lat, lon)).toBeNull()
  })
})

describe('midtpunkt', () => {
  it('hopper over hull og tar punktet halvveis', () => {
    expect(midtpunkt([null, 60, 61, 62], [null, 10, 11, 12])).toEqual([61, 11])
    expect(midtpunkt([null], [null])).toBeNull()
  })
})
