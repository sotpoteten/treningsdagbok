import { describe, expect, it } from 'vitest'
import { tempo, timer, varighet } from './format'

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
})
