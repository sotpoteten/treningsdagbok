import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'
import { mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { Dagbok } from '../src/data/last'
import { lagRundeleser, lesDagbok } from './data'
import { lagPrompt } from './prompt'
import { dager, finnOkter, okt, perioder, ukekommentarer, Verktoyfeil } from './verktoy'

/** Det tjeneren strømmer til siden. */
export type Hendelse =
  | { type: 'tekst'; delta: string }
  | { type: 'status'; tekst: string }
  /** Teksten så langt var en mellommelding før et oppslag, ikke en del av svaret. */
  | { type: 'forkast' }
  | { type: 'ferdig'; samtaleId: string }
  | { type: 'feil'; melding: string }

export interface Oppsett {
  datamappe: string
  modell: string
  /** Settes bare hvis Isak har lagt inn en API-nøkkel; ellers brukes innloggingen fra Claude Code. */
  apiNokkel?: string
}

// Samtalene lagres av SDK-en per arbeidsmappe, så mappa må være den samme hver gang.
const ARBEIDSMAPPE = join(tmpdir(), 'treningsdagbok-spor')

const dato = z.string().describe('Dato som ÅÅÅÅ-MM-DD')
const typer = z.enum(['loping', 'ski', 'sykkel', 'styrke', 'otek', 'konk'])

let buffer: { tid: number; dagbok: Dagbok } | null = null

/** Dagboka leses på nytt når okter.json er endret, f.eks. etter en ny eksport. */
function hentDagbok(datamappe: string): Dagbok {
  const tid = statSync(join(datamappe, 'okter.json')).mtimeMs
  if (buffer?.tid !== tid) buffer = { tid, dagbok: lesDagbok(datamappe) }
  return buffer.dagbok
}

function lagVerktoy(dagbok: Dagbok, datamappe: string) {
  const lesRunder = lagRundeleser(datamappe)
  const svar = (kjor: () => unknown) => {
    try {
      return { content: [{ type: 'text' as const, text: JSON.stringify(kjor()) }] }
    } catch (e) {
      if (e instanceof Verktoyfeil) return { content: [{ type: 'text' as const, text: e.message }], isError: true }
      throw e
    }
  }
  const lese = { annotations: { readOnlyHint: true } }

  return createSdkMcpServer({
    name: 'dagbok',
    tools: [
      tool(
        'perioder',
        'Treningssummer per uke, måned, sesong eller kalenderår i et tidsrom: økter, timer, km løping, minutter per sone, styrke, o-teknikk, tid per bevegelsesform, kvalitetsøkter, konkurranse-, syke- og skadedager, og snitt av hvilepuls, HRV, søvn og Garmins akutte belastning. Uker er alltid hele ISO-uker. Maks 160 rader.',
        { fra: dato, til: dato, opplosning: z.enum(['uke', 'maned', 'sesong', 'ar']) },
        async (a) => svar(() => perioder(dagbok, a)),
        lese,
      ),
      tool(
        'finn_okter',
        'Søk i øktene. «sok» leter i navn, beskrivelse og Isaks notat (hvert ord må stå i starten av et ord). Kan avgrenses på type, tidsrom og minste antall minutter i I3–I5, og sorteres. Gir antall treff, summen av alle treff og en liste med de første øktene (id, dato, navn, minutter, km, soner, opplevd belastning, dagsform og forkortet notat).',
        {
          sok: z.string().optional(),
          typer: z.array(typer).optional().describe('Treff hvis økta har minst én av typene. «konk» er økter på konkurransedager.'),
          fra: dato.optional(),
          til: dato.optional(),
          min_harde_min: z.number().optional().describe('Minste antall minutter i I3–I5'),
          sorter: z.enum(['nyeste', 'eldste', 'lengst', 'lengst_distanse', 'mest_hardt']).optional(),
          antall: z.number().int().min(1).max(50).optional().describe('Antall økter i lista, standard 20'),
        },
        async (a) => svar(() => finnOkter(dagbok, a)),
        lese,
      ),
      tool(
        'okt',
        'Alt om én økt: blokker med soner og km, hele notatet, kommentarer fra andre, opplevd belastning, dagsform og koblede Garmin-aktiviteter med puls, høydemeter, Training Effect og runder (tid, distanse, puls, tempo).',
        { id: z.string().describe('Øktas id fra finn_okter eller dager') },
        async (a) => svar(() => okt(dagbok, a, lesRunder)),
        lese,
      ),
      tool(
        'dager',
        'Dag for dag i et tidsrom på inntil 62 dager: flagg (konkurranse, syk, skadet, reise, hoyde, fridag), dagsnotat, sykdoms- og skadedetaljer, hvilepuls, HRV, søvn, Garmins belastning (akutt, kronisk, ACWR) og dagens økter.',
        { fra: dato, til: dato },
        async (a) => svar(() => dager(dagbok, a)),
        lese,
      ),
      tool(
        'ukekommentarer',
        'Isaks egne ukesoppsummeringer, nyeste først, i et tidsrom og/eller med søkeord. Maks 30 uker per kall.',
        { fra: dato.optional(), til: dato.optional(), sok: z.string().optional() },
        async (a) => svar(() => ukekommentarer(dagbok, a)),
        lese,
      ),
    ],
  })
}

const VERKTOY = ['perioder', 'finn_okter', 'okt', 'dager', 'ukekommentarer'].map((n) => `mcp__dagbok__${n}`)

/** Kort tekst til statuslinja mens et verktøy kjører. */
function status(navn: string, inn: Record<string, unknown>): string {
  const kort = (d: unknown) => String(d).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, a, m, dag) => `${+dag}.${+m}.${a}`)
  const rom = inn.fra && inn.til ? ` ${kort(inn.fra)}–${kort(inn.til)}` : ''
  switch (navn) {
    case 'mcp__dagbok__perioder':
      return `Henter ${{ uke: 'uker', maned: 'måneder', sesong: 'sesonger', ar: 'år' }[String(inn.opplosning)] ?? 'perioder'}${rom}`
    case 'mcp__dagbok__finn_okter':
      return inn.sok ? `Søker i øktene etter «${inn.sok}»` : `Leter i øktene${rom}`
    case 'mcp__dagbok__okt':
      return 'Leser en økt'
    case 'mcp__dagbok__dager':
      return `Leser dagene${rom}`
    case 'mcp__dagbok__ukekommentarer':
      return `Leser ukeskommentarer${rom}`
    case 'WebSearch':
      return `Søker på nettet etter «${inn.query}»`
    case 'WebFetch': {
      try {
        return `Leser ${new URL(String(inn.url)).hostname}`
      } catch {
        return 'Leser en nettside'
      }
    }
    default:
      return 'Arbeider'
  }
}

const FEIL: Record<string, string> = {
  authentication_failed: 'Claude er ikke innlogget på denne maskinen. Logg inn i Claude Code og prøv igjen.',
  rate_limit: 'Bruksgrensen i Claude-abonnementet er nådd. Prøv igjen senere.',
  overloaded: 'Claude er overbelastet akkurat nå. Prøv igjen om litt.',
  billing_error: 'Claude avviste forespørselen på grunn av betaling eller abonnement.',
}

/** Stiller ett spørsmål og strømmer svaret. `samtaleId` fortsetter en tidligere samtale. */
export async function* spor(
  oppsett: Oppsett,
  sporsmal: string,
  samtaleId: string | undefined,
  avbryt: AbortController,
): AsyncGenerator<Hendelse> {
  mkdirSync(ARBEIDSMAPPE, { recursive: true })
  const dagbok = hentDagbok(oppsett.datamappe)
  const idag = new Date().toLocaleDateString('sv-SE')
  let harTekst = false

  const svar = query({
    prompt: sporsmal,
    options: {
      cwd: ARBEIDSMAPPE,
      model: oppsett.modell,
      systemPrompt: lagPrompt(dagbok, idag),
      mcpServers: { dagbok: lagVerktoy(dagbok, oppsett.datamappe) },
      // Bare dagbokverktøyene og nettet. Ingen fil-, skall- eller redigeringsverktøy,
      // og verken Isaks Claude Code-oppsett eller kontoens koblinger lastes inn.
      tools: ['WebSearch', 'WebFetch'],
      allowedTools: ['WebSearch', 'WebFetch', ...VERKTOY],
      permissionMode: 'dontAsk',
      settingSources: [],
      strictMcpConfig: true,
      settings: { disableClaudeAiConnectors: true },
      includePartialMessages: true,
      maxTurns: 40,
      resume: samtaleId,
      abortController: avbryt,
      ...(oppsett.apiNokkel ? { env: { ...process.env, ANTHROPIC_API_KEY: oppsett.apiNokkel } } : {}),
    },
  })

  for await (const m of svar) {
    if (m.type === 'stream_event' && m.parent_tool_use_id === null) {
      const e = m.event
      if (e.type === 'content_block_start' && e.content_block.type === 'text' && harTekst) yield { type: 'tekst', delta: '\n\n' }
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
        harTekst = true
        yield { type: 'tekst', delta: e.delta.text }
      }
    } else if (m.type === 'assistant' && m.parent_tool_use_id === null) {
      if (m.error) {
        yield { type: 'feil', melding: FEIL[m.error] ?? `Claude svarte med en feil (${m.error}).` }
        return
      }
      const oppslag = m.message.content.filter((b) => b.type === 'tool_use')
      if (oppslag.length && harTekst) {
        harTekst = false
        yield { type: 'forkast' }
      }
      for (const b of oppslag)
        if (b.type === 'tool_use') yield { type: 'status', tekst: status(b.name, b.input as Record<string, unknown>) }
    } else if (m.type === 'result') {
      if (m.subtype === 'success' && !m.is_error) yield { type: 'ferdig', samtaleId: m.session_id }
      else if (m.subtype === 'error_max_turns')
        yield { type: 'feil', melding: 'Spørsmålet krevde for mange oppslag. Prøv å avgrense det.' }
      else yield { type: 'feil', melding: 'Noe gikk galt underveis. Prøv igjen.' }
    }
  }
}
