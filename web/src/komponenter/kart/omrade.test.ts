import { describe, expect, it } from 'vitest'
import { iNorge, midtpunkt } from './omrade'

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

describe('midtpunkt', () => {
  it('hopper over hull og tar punktet halvveis', () => {
    expect(midtpunkt([null, 60, 61, 62], [null, 10, 11, 12])).toEqual([61, 11])
    expect(midtpunkt([null], [null])).toBeNull()
  })
})
