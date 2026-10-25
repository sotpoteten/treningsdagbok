import type { IncomingMessage } from 'node:http'
import { resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'
import type { Hendelse, Oppsett } from './agent.ts'

// Assistenten bak siden «Spør». Den lever i utviklingsserveren (POST /api/spor) og finnes
// ikke i den bygde, statiske siden. Selve agenten lastes gjennom Vite ved første spørsmål,
// så endringer i den slår inn uten omstart.

const MAKS_TEGN = 8000

function lesKropp(req: IncomingMessage): Promise<string> {
  return new Promise((ok, feil) => {
    let tekst = ''
    req.setEncoding('utf-8')
    req.on('data', (bit: string) => {
      tekst += bit
      if (tekst.length > MAKS_TEGN * 4) feil(new Error('for stor forespørsel'))
    })
    req.on('end', () => ok(tekst))
    req.on('error', feil)
  })
}

/** Bare siden selv får spørre: forespørselen må komme fra og til localhost. */
export function erLokal(req: Pick<IncomingMessage, 'headers'>): boolean {
  const lokal = (vert: string | undefined) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(vert ?? '')
  if (!lokal(req.headers.host)) return false
  const opphav = req.headers.origin
  if (!opphav) return true
  try {
    return lokal(new URL(opphav).host)
  } catch {
    return false
  }
}

export function assistent(): Plugin {
  let oppsett: Oppsett
  return {
    name: 'treningsdagbok-assistent',
    apply: 'serve',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      oppsett = {
        datamappe: resolve(config.root, '../data'),
        modell: env.ASSISTENT_MODELL || 'claude-opus-5-5',
        apiNokkel: env.ANTHROPIC_API_KEY || undefined,
      }
    },
    configureServer(server) {
      server.middlewares.use('/api/spor', async (req, res) => {
        if (req.method !== 'POST' || !erLokal(req)) {
          res.statusCode = req.method === 'POST' ? 403 : 405
          res.end()
          return
        }
        let sporsmal: string
        let samtaleId: string | undefined
        try {
          const inn = JSON.parse(await lesKropp(req)) as { sporsmal?: unknown; samtaleId?: unknown }
          if (typeof inn.sporsmal !== 'string' || !inn.sporsmal.trim() || inn.sporsmal.length > MAKS_TEGN) throw new Error('ugyldig')
          sporsmal = inn.sporsmal.trim()
          samtaleId = typeof inn.samtaleId === 'string' && /^[0-9a-f-]{36}$/.test(inn.samtaleId) ? inn.samtaleId : undefined
        } catch {
          res.statusCode = 400
          res.end()
          return
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        const send = (h: Hendelse) => res.write(`data: ${JSON.stringify(h)}\n\n`)
        const avbryt = new AbortController()
        // Lukker nettleseren forbindelsen («Stopp»), stopper også modellen.
        res.on('close', () => avbryt.abort())

        try {
          const { spor } = (await server.ssrLoadModule('/assistent/agent.ts')) as typeof import('./agent.ts')
          for await (const h of spor(oppsett, sporsmal, samtaleId, avbryt)) send(h)
        } catch (e) {
          if (!avbryt.signal.aborted) {
            server.config.logger.error(`[spør] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
            send({ type: 'feil', melding: 'Assistenten stoppet uventet. Se terminalen der siden kjører.' })
          }
        }
        res.end()
      })
    },
  }
}
