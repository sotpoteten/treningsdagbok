import { useMemo } from 'react'
import { dato, km, timer } from '../../data/format'
import { datoISesong, endring, kumulativ, sammeDatoI, sesongDag, type Mal, type Sesong } from '../../data/statistikk'
import { Grafkort, Segment } from '../../komponenter/graf/felles'
import { Linjer, type Linjeserie } from '../../komponenter/graf/Linjer'
import { useUrlTilstand } from '../../komponenter/useUrlTilstand'
import type { Analysekontekst } from '../Analyse'

const MANEDER = ['11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10']

export function Sesonger({ k }: { k: Analysekontekst }) {
  const [mal, setMal] = useUrlTilstand<Mal>('mal', 'timer', ['timer', 'km'])
  const vis = (v: number) => (mal === 'timer' ? `${timer(v * 60)} t` : `${km(v)} km`)

  const serier = useMemo<Linjeserie[]>(
    () =>
      k.sesonger.map((s) => {
        const alle = kumulativ(k.dagbok.okter, s, mal)
        // Sesongen som pågår, slutter ved siste importerte økt, uansett hvilken sesong som er valgt.
        const siste = k.dagbok.sisteDato
        const pagaende = siste < s.til && siste >= s.fra
        return {
          id: s.navn,
          navn: s.navn,
          verdier: pagaende ? alle.slice(0, sesongDag(siste) + 1) : alle,
          vekt: s.navn === k.valgt.navn ? 'valgt' : s.navn === k.forrige?.navn ? 'forrige' : 'bakgrunn',
        }
      }),
    [k, mal],
  )

  const lengde = 366
  const xMerker = MANEDER.map((m) => {
    const ar = m >= '11' ? k.valgt.fra.slice(0, 4) : k.valgt.til.slice(0, 4)
    const d = `${ar}-${m}-01`
    return { indeks: sesongDag(d), etikett: dato(d, 'MMM').replace('.', '') }
  })
  const sesongAv = new Map(k.sesonger.map((s) => [s.navn, s]))
  // Verdien ved utgangen av samme kalenderdato i seriens egen sesong (dag nr. flyttes av skuddåret).
  const dagFor = (s: Linjeserie, d: string) => sesongDag(sammeDatoI(sesongAv.get(s.id)!, d))
  const verdiPa = (s: Linjeserie, d: string) => s.verdier[Math.min(dagFor(s, d), s.verdier.length - 1)]
  // Sesongen som pågår, når ikke fram til datoen når en ferdig sesong er valgt. Da vises verdien
  // ved siste økt, merket «pågår», uten endring mot en hel sesong.
  const naarIkkeFram = (s: Linjeserie, d: string) => dagFor(s, d) >= s.verdier.length

  const sammenligning = (
    <table className="arstabell sammenligning">
      <thead>
        <tr>
          <th scope="col">Sesong</th>
          <th scope="col">Til {dato(k.sluttdato, 'd. MMM')}</th>
          <th scope="col">Mot sesongen før</th>
          <th scope="col">Hele sesongen</th>
        </tr>
      </thead>
      <tbody>
        {[...serier].reverse().map((s, i, liste) => {
          const forrige = liste[i + 1]
          const na = verdiPa(s, k.sluttdato)
          const kort = naarIkkeFram(s, k.sluttdato)
          const e = forrige && !kort ? endring(na, verdiPa(forrige, k.sluttdato)) : null
          const ferdig = s.verdier.length >= 365
          return (
            <tr key={s.id} className={s.vekt === 'valgt' ? 'valgt' : undefined}>
              <th scope="row">{s.navn}</th>
              <td>
                {vis(na)}
                {kort && <span className="hint"> pågår</span>}
              </td>
              <td className="endring">{e == null ? '–' : `${Math.round(e) > 0 ? '+' : Math.round(e) < 0 ? '−' : '±'}${Math.abs(Math.round(e))} %`}</td>
              <td>{ferdig ? vis(s.verdier[s.verdier.length - 1]) : 'pågår'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  // Tabellvisningen: akkumulert verdi ved slutten av hver måned, per sesong. Månedsslutten
  // regnes i hver sesongs egen kalender, så februar slutter 29. i skuddår.
  const ar = (s: Sesong, m: string) => (m >= '11' ? s.fra : s.til).slice(0, 4)
  const manedsslutt = MANEDER.map((m, i) => {
    const neste = MANEDER[(i + 1) % 12]
    const dag = (s: Sesong) => (i === 11 ? s.dager - 1 : sesongDag(`${ar(s, neste)}-${neste}-01`) - 1)
    return { etikett: dato(`${ar(k.valgt, m)}-${m}-01`, 'MMM').replace('.', ''), dag }
  })
  const vedUtgangen = (s: Linjeserie, dag: (s: Sesong) => number) => {
    const i = dag(sesongAv.get(s.id)!)
    return i < s.verdier.length ? vis(s.verdier[i]) : ''
  }
  const tabell = () => (
    <table className="arstabell">
      <thead>
        <tr>
          <th scope="col">Ved utgangen av</th>
          {[...serier].reverse().map((s) => (
            <th key={s.id} scope="col">
              {s.navn}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {manedsslutt.map((m) => (
          <tr key={m.etikett}>
            <th scope="row">{m.etikett}</th>
            {[...serier].reverse().map((s) => (
              <td key={s.id}>{vedUtgangen(s, m.dag)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <Grafkort
      id="akkumulert"
      tittel={mal === 'timer' ? 'Akkumulerte timer gjennom sesongen' : 'Akkumulerte km gjennom sesongen'}
      forklaring={`Fra 1. november. ${k.valgt.navn} er den blå linja og ${k.forrige?.navn ?? 'sesongen før'} den kraftige nøytrale. De andre sesongene står dempet. Hold over et navn under grafen for å fremheve sesongen.`}
      forklaringTabell={`Akkumulert ${mal === 'timer' ? 'tid' : 'distanse'} fra 1. november til utgangen av hver måned, én kolonne per sesong. Februar slutter 29. i skuddår. Sesongen som pågår, står tom etter siste hele måned.`}
      valg={<Segment etikett="Mål" verdi={mal} onEndre={setMal} valg={[{ id: 'timer', navn: 'Timer' }, { id: 'km', navn: 'Km' }]} />}
      tabell={tabell}
    >
      <Linjer
        serier={serier}
        lengde={lengde}
        xMerker={xMerker}
        merke={k.pagaende ? { indeks: sesongDag(k.sluttdato), etikett: 'siste økt' } : undefined}
        yFormat={(v) => (mal === 'timer' ? `${v} t` : `${v}`)}
        beskrivelse={`Akkumulerte ${mal} per sesong fra 1. november`}
        tips={(i) => {
          const rader = serier
            .filter((s) => i < s.verdier.length)
            .sort((a, b) => b.verdier[i] - a.verdier[i])
          return (
            <>
              <b>{dato(datoISesong(k.valgt, Math.min(i, k.valgt.dager - 1)), 'd. MMMM')}</b>
              {rader.map((s) => (
                <span key={s.id} className={`tips-rad${s.vekt === 'bakgrunn' ? ' dempet' : ''}`}>
                  <i className={`linjenokkel vekt-${s.vekt}`} />
                  {s.navn} <span className="tips-verdi">{vis(s.verdier[i])}</span>
                </span>
              ))}
            </>
          )
        }}
      />
      <h3 className="grafkort-undertittel">Til {dato(k.sluttdato, 'd. MMMM')} i hver sesong</h3>
      {sammenligning}
    </Grafkort>
  )
}
