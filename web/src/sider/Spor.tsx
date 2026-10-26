import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type FormEvent, type KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { Topplinje } from '../komponenter/Topplinje'

interface Utveksling {
  sporsmal: string
  svar: string
  /** Det assistenten gjør akkurat nå; bare mens den arbeider. */
  status?: string
  feil?: string
  stoppet?: boolean
}

interface Samtale {
  id?: string
  utvekslinger: Utveksling[]
}

type Hendelse =
  | { type: 'tekst'; delta: string }
  | { type: 'status'; tekst: string }
  | { type: 'forkast' }
  | { type: 'ferdig'; samtaleId: string }
  | { type: 'feil'; melding: string }

const LAGER = 'spor-samtale'
const FORSLAG = [
  'Hvordan er intensitetsfordelingen min denne sesongen sammenlignet med forrige, og med det forskningen sier om eliteutøvere i utholdenhetsidrett?',
  'Hva kjennetegner ukene før de beste konkurransene mine?',
  'Hvordan har hvilepuls og HRV utviklet seg rundt periodene der jeg har vært syk?',
  'Har jeg økt treningsmengden for raskt noen gang, og hva skjedde etterpå?',
]

function lesLagret(): Samtale {
  try {
    const s = JSON.parse(localStorage.getItem(LAGER) ?? 'null') as Samtale | null
    if (s && Array.isArray(s.utvekslinger)) return s
  } catch {
    /* lagring er bare en bekvemmelighet */
  }
  return { utvekslinger: [] }
}

/** Lenker til uker og økter i dagboka går gjennom ruteren; kilder på nettet åpnes i ny fane. */
function Lenke({ href = '', children }: ComponentProps<'a'>) {
  if (href.startsWith('#/')) return <Link to={href.slice(1)}>{children}</Link>
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function Tabell(props: ComponentProps<'table'>) {
  return (
    <div className="svartabell">
      <table {...props} />
    </div>
  )
}

const KOMPONENTER = { a: Lenke, table: Tabell }

export function Spor() {
  const [samtale, setSamtale] = useState<Samtale>(lesLagret)
  const [utkast, setUtkast] = useState('')
  const [arbeider, setArbeider] = useState(false)
  const avbryt = useRef<AbortController | null>(null)
  const felt = useRef<HTMLTextAreaElement>(null)
  const rull = useRef<HTMLElement>(null)
  const folgBunnen = useRef(true)

  useEffect(() => {
    if (arbeider) return
    try {
      localStorage.setItem(LAGER, JSON.stringify(samtale))
    } catch {
      /* lagring er bare en bekvemmelighet */
    }
  }, [samtale, arbeider])

  // Følg svaret nedover mens det skrives, men ikke hvis Isak har rullet opp for å lese.
  useLayoutEffect(() => {
    const r = rull.current
    if (r && folgBunnen.current) r.scrollTop = r.scrollHeight
  }, [samtale])

  useLayoutEffect(() => {
    const f = felt.current
    if (!f) return
    f.style.height = 'auto'
    f.style.height = `${f.scrollHeight}px`
  }, [utkast])

  useEffect(() => () => avbryt.current?.abort(), [])

  function oppdaterSiste(endre: (u: Utveksling) => Utveksling) {
    setSamtale((s) => ({ ...s, utvekslinger: s.utvekslinger.map((u, i) => (i === s.utvekslinger.length - 1 ? endre(u) : u)) }))
  }

  async function send(tekst: string) {
    const sporsmal = tekst.trim()
    if (!sporsmal || arbeider) return
    setUtkast('')
    setArbeider(true)
    folgBunnen.current = true
    setSamtale((s) => ({ ...s, utvekslinger: [...s.utvekslinger, { sporsmal, svar: '', status: 'Tenker' }] }))
    const kontroll = new AbortController()
    avbryt.current = kontroll

    try {
      const svar = await fetch('/api/spor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sporsmal, samtaleId: samtale.id }),
        signal: kontroll.signal,
      })
      if (!svar.ok || !svar.body) throw new Error(`Tjeneren svarte ${svar.status}.`)

      const leser = svar.body.pipeThrough(new TextDecoderStream()).getReader()
      let rest = ''
      for (;;) {
        const { value, done } = await leser.read()
        if (done) break
        rest += value
        const deler = rest.split('\n\n')
        rest = deler.pop() ?? ''
        for (const del of deler) {
          if (!del.startsWith('data: ')) continue
          const h = JSON.parse(del.slice(6)) as Hendelse
          if (h.type === 'tekst') oppdaterSiste((u) => ({ ...u, svar: u.svar + h.delta, status: undefined }))
          else if (h.type === 'status') oppdaterSiste((u) => ({ ...u, status: h.tekst }))
          else if (h.type === 'forkast') oppdaterSiste((u) => ({ ...u, svar: '' }))
          else if (h.type === 'feil') oppdaterSiste((u) => ({ ...u, feil: h.melding, status: undefined }))
          else setSamtale((s) => ({ ...s, id: h.samtaleId }))
        }
      }
      oppdaterSiste((u) => ({ ...u, status: undefined }))
    } catch (e) {
      if (kontroll.signal.aborted) oppdaterSiste((u) => ({ ...u, status: undefined, stoppet: true }))
      else
        oppdaterSiste((u) => ({
          ...u,
          status: undefined,
          feil: `Fikk ikke kontakt med assistenten. Sjekk at siden kjører med «npm run dev». (${(e as Error).message})`,
        }))
    } finally {
      avbryt.current = null
      setArbeider(false)
      felt.current?.focus()
    }
  }

  function nySamtale() {
    avbryt.current?.abort()
    setSamtale({ utvekslinger: [] })
    felt.current?.focus()
  }

  function vedSend(e: FormEvent) {
    e.preventDefault()
    void send(utkast)
  }
  function vedTast(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(utkast)
    }
  }
  function vedRull() {
    const r = rull.current
    if (r) folgBunnen.current = r.scrollHeight - r.scrollTop - r.clientHeight < 80
  }

  const tom = samtale.utvekslinger.length === 0
  const lokal = import.meta.env.DEV

  return (
    <>
      <Topplinje>
        {!tom && (
          <button type="button" className="lenkeknapp" onClick={nySamtale}>
            Ny samtale
          </button>
        )}
      </Topplinje>
      <main className="spor" ref={rull} onScroll={vedRull} data-husk-rull="spor">
        <div className="spor-spalte">
          {tom ? (
            <div className="spor-start">
              <h1>Spør dagboka</h1>
              <p className="ingress">
                Still spørsmål om treningen din. Assistenten henter tallene fra dagboka og Garmin-dataene, og ser dem opp mot
                treningslære og forskning på eliteutøvere.
              </p>
              {lokal ? (
                <ul className="spor-forslag">
                  {FORSLAG.map((f) => (
                    <li key={f}>
                      <button type="button" onClick={() => void send(f)}>
                        {f}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="spor-melding">
                  Assistenten finnes bare når siden kjøres lokalt med «npm run dev». Denne utgaven av siden er statisk.
                  Lokalt svarer den med tabeller, kilder og lenker til uker og økter;{' '}
                  <a href="https://github.com/sotpoteten/treningsdagbok#spør-ai-assistenten">README viser et eksempel</a>.
                </p>
              )}
            </div>
          ) : (
            <ol className="spor-samtale">
              {samtale.utvekslinger.map((u, i) => (
                <li key={i}>
                  <h2 className="spor-sporsmal">{u.sporsmal}</h2>
                  {u.svar && (
                    <div className="spor-svar">
                      <Markdown remarkPlugins={[remarkGfm]} components={KOMPONENTER}>
                        {u.svar}
                      </Markdown>
                    </div>
                  )}
                  {u.status && (
                    <p className="spor-status" role="status">
                      <span className="spor-puls" aria-hidden="true" />
                      {u.status} …
                    </p>
                  )}
                  {u.stoppet && <p className="spor-melding">Stoppet.</p>}
                  {u.feil && (
                    <p className="spor-melding feil" role="alert">
                      {u.feil}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
      {lokal && (
        <form className="spor-skriv" onSubmit={vedSend}>
          <div className="spor-spalte">
            <div className="spor-felt">
              <textarea
                ref={felt}
                rows={1}
                value={utkast}
                onChange={(e) => setUtkast(e.target.value)}
                onKeyDown={vedTast}
                placeholder={tom ? 'Hva lurer du på?' : 'Spør videre'}
                aria-label="Spørsmål til dagboka"
                maxLength={8000}
                autoFocus
              />
              {arbeider ? (
                <button type="button" className="ikonknapp" onClick={() => avbryt.current?.abort()} aria-label="Stopp svaret">
                  <Square />
                </button>
              ) : (
                <button type="submit" className="ikonknapp spor-send" disabled={!utkast.trim()} aria-label="Send spørsmålet">
                  <ArrowUp />
                </button>
              )}
            </div>
            <p className="spor-merknad">
              Når du spør, sendes spørsmålet og de tallene og notatene svaret trenger, til Anthropic. GPS-spor sendes aldri.
            </p>
          </div>
        </form>
      )}
    </>
  )
}
