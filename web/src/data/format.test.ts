import { describe, expect, it } from 'vitest'
import { pulsomrade, tempo, timer, varighet } from './format'

describe('format', () => {
  it('timer runder av til hele minutter før timer og minutter skilles', () => {
    expect(timer(380)).toBe('6:20')
    expect(timer(59.6)).toBe('1:00')
    expect(timer(618 * 60 + 59.7)).toBe('619:00')
    expect(timer(0)).toBe('0:00')
  })

  it('varighet og tempo', () => {
    expect(varighet(43)).toBe('43′')
    expect(varighet(110)).toBe('1:50')
    expect(tempo(5.35)).toBe('5:21')
    expect(tempo(4.999)).toBe('5:00')
  })

  it('pulsområdet viser den øverste sonen uten øvre grense', () => {
    const p = { I1: { Min: 110, Max: 144 }, I2: { Min: 145, Max: 164 }, I3: { Min: 165, Max: 174 },
      I4: { Min: 175, Max: 184 }, I5: { Min: 185, Max: 210 }, enhet: 'slag/min', sist_oppdatert: '2026-10-22' }
    expect(pulsomrade(p, 'I1')).toBe('110–144')
    expect(pulsomrade(p, 'I5')).toBe('185+')
  })
})
