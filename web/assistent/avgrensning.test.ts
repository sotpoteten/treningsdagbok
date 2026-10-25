import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { avgrensning } from './agent'
import { erLokal } from './tillegg'

const foresporsel = (host?: string, origin?: string) => ({ headers: { host, origin } })

describe('tillegg: bare forespørsler fra localhost', () => {
  it('godtar localhost, 127.0.0.1 og ::1, med og uten port', () => {
    for (const vert of ['localhost:5180', 'localhost', '127.0.0.1:5180', '[::1]:5180']) {
      expect(erLokal(foresporsel(vert)), vert).toBe(true)
      expect(erLokal(foresporsel(vert, `http://${vert}`)), vert).toBe(true)
    }
    expect(erLokal(foresporsel('localhost:5180', 'http://127.0.0.1:5180'))).toBe(true)
  })

  it('avviser andre verter (også DNS-rebinding med falsk Host)', () => {
    for (const vert of [undefined, '', 'eksempel.no', '192.168.1.10:5180', 'localhost.eksempel.no', 'localhost:5180.eksempel.no', 'evil.localhost']) {
      expect(erLokal(foresporsel(vert)), String(vert)).toBe(false)
    }
  })

  it('avviser forespørsler fra andre nettsider, selv om Host er localhost', () => {
    for (const opphav of ['https://eksempel.no', 'http://localhost.eksempel.no', 'http://192.168.1.10:5180', 'null', 'ikke en url']) {
      expect(erLokal(foresporsel('localhost:5180', opphav)), opphav).toBe(false)
    }
  })
})

describe('agent: avgrensningen holder', () => {
  const a = avgrensning()

  it('laster verken Isaks oppsett eller kontoens koblinger', () => {
    expect(a.settingSources).toEqual([])
    expect(a.strictMcpConfig).toBe(true)
    expect(a.settings).toEqual({ disableClaudeAiConnectors: true })
    expect(a.permissionMode).toBe('dontAsk')
  })

  it('har bare nettsøk, nettlesing og dagbokverktøyene', () => {
    expect(a.tools).toEqual(['WebSearch', 'WebFetch'])
    expect([...a.allowedTools].sort()).toEqual(
      ['WebFetch', 'WebSearch', ...['dager', 'finn_okter', 'konkurranser', 'okt', 'perioder', 'ukekommentarer'].map((n) => `mcp__dagbok__${n}`)].sort(),
    )
  })

  it('spor() bruker avgrensningen, uten å overstyre den, og bare dagbok-tjeneren', () => {
    const kilde = readFileSync(resolve(__dirname, 'agent.ts'), 'utf-8')
    const valg = kilde.slice(kilde.indexOf('options: {'))
    expect(valg).toContain('mcpServers: { dagbok: lagVerktoy(')
    expect(valg).toContain('...avgrensning(),')
    const etter = valg.slice(valg.indexOf('...avgrensning(),'), valg.indexOf('\n    },'))
    for (const felt of ['tools', 'allowedTools', 'disallowedTools', 'permissionMode', 'settingSources', 'strictMcpConfig', 'settings', 'mcpServers', 'canUseTool'])
      expect(etter, felt).not.toMatch(new RegExp(`\\b${felt}:`))
  })
})
