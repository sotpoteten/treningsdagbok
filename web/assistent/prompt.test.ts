import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DAGBOK_FRA } from '../src/data/last'
import { lesDagbok } from './data'
import { lagPrompt, oppfrisking } from './prompt'

const dagbok = lesDagbok(resolve(__dirname, '../../data'))

describe('prompt', () => {
  it('sier at dagboka starter med Excel-dagboka i 2016, og har sesongene derfra', () => {
    const p = lagPrompt(dagbok, '2026-11-17')
    expect(p).toContain('Dagboka dekker 1. november 2016')
    expect(p).toContain('| 2016/17 |')
  })

  it('gir en fortsatt samtale dagens dato og hele tidsrommet', () => {
    const o = oppfrisking(dagbok, '2026-11-17')
    expect(o).toContain('Dagens dato er 2026-11-17')
    expect(o).toContain(`Dagboka dekker nå ${dagbok.okter[0].dato} til ${dagbok.okter[dagbok.okter.length - 1].dato}`)
    expect(dagbok.okter[0].dato.slice(0, 7)).toBe(DAGBOK_FRA.slice(0, 7))
  })
})
