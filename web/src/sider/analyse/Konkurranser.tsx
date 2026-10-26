import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { dato, km, timer } from '../../data/format'
import {
  disiplinerIBruk,
  DISIPLIN_NAVN,
  disiplinTekst,
  filtrer,
  indeks,
  klokke,
  OPPKJORING_DAGER,
  oppkjoring,
  plassTekst,
  prosent,
  snittOppkjoring,
  TYPE_NAVN,
  typerIBruk,
  type Oppkjoring,
} from '../../data/konkurranser'
import { dagerMellom } from '../../data/statistikk'
import type { Disiplin, Konkurranse, Konkurransetype, Stafett } from '../../data/typer'
import { ukeForDato } from '../../data/uker'
import { Grafkort, Segment, Tegnforklaring } from '../../komponenter/graf/felles'
import { Tidsserie } from '../../komponenter/graf/Tidsserie'
import { Eksternlenker as Lenker, UGYLDIGE_STREKK } from '../../komponenter/Resultat'
import type { Analysekontekst } from '../Analyse'

type Periode = 'sesong' | 'alle'
const en = (v: number | null | undefined, d = 0) => (v == null ? '–' : v.toLocaleString('nb-NO', { maximumFractionDigits: d }))

export function Konkurranser({ k }: { k: Analysekontekst }) {
  if (!k.dagbok.konkurranser.length) {
    return (
      <section className="analyse-del">
        <h1>Konkurranser</h1>
        <p className="ingress">
          Fant ingen resultater. Kjør <code>python scripts/hent_eventor.py</code> for å hente dem fra Eventor, og start siden på nytt.
        </p>
      </section>
    )
  }
  return <KonkurranserInnhold k={k} />
}

/** Etiketter på x-aksen: måneder i én sesong, sesongstart (1. nov.) over flere. */
function lagXMerker(fra: string, til: string, alle: boolean) {
  const ut: { x: number; etikett: string }[] = []
  let [a, m] = [+fra.slice(0, 4), +fra.slice(5, 7)]
  for (;;) {
    const d = `${a}-${String(m).padStart(2, '0')}-01`
    if (d > til) break
    if (d >= fra && (!alle || m === 11))
      ut.push({ x: dagerMellom(fra, d), etikett: alle ? `${String(a).slice(2)}/${String(a + 1).slice(2)}` : dato(d, 'MMM').replace('.', '') })
    if (++m > 12) [a, m] = [a + 1, 1]
  }
  return ut
}

function KonkurranserInnhold({ k }: { k: Analysekontekst }) {
  const [periode, setPeriode] = useState<Periode>('sesong')
  const [type, setType] = useState<Konkurransetype>('o-løp')
  const [disiplinOnsket, setDisiplin] = useState<Disiplin | 'alle'>('alle')
  const [aktiv, setAktiv] = useState<number | null>(null)
  const [params, setParams] = useSearchParams()
  const { dagbok } = k

  const fra = periode === 'sesong' ? k.valgt.fra : k.sesonger[0].fra
  // Alle sesonger går til siste importerte økt, uansett hvilken sesong som er valgt.
  const til = periode === 'alle' ? dagbok.sisteDato : k.sluttdato
  const alle = periode === 'alle'

  const typer = typerIBruk(dagbok.konkurranser)
  const iType = useMemo(() => filtrer(dagbok.konkurranser, { type }), [dagbok, type])
  const disipliner = disiplinerIBruk(iType)
  // En disiplin som ikke finnes for typen (f.eks. tempO for o-løp), faller tilbake til alle.
  const disiplin = disiplinOnsket !== 'alle' && disipliner.includes(disiplinOnsket) ? disiplinOnsket : 'alle'

  const utvalg = useMemo(
    () => filtrer(iType, { disiplin: disiplin === 'alle' ? undefined : disiplin, fra, til }),
    [iType, disiplin, fra, til],
  )
  const stafetter = dagbok.stafetter.filter((s) => s.dato >= fra && s.dato <= til)

  // Valgt løp ligger i URL-en (?lop=<eventor-id>), ellers det siste fullførte i utvalget.
  const onsketId = Number(params.get('lop'))
  const valgtIndeks = (() => {
    const i = utvalg.findIndex((x) => x.eventor_id === onsketId)
    if (i >= 0) return i
    for (let j = utvalg.length - 1; j >= 0; j--) if (utvalg[j].prosent_bak != null) return j
    return utvalg.length - 1
  })()
  const valgt = valgtIndeks >= 0 ? utvalg[valgtIndeks] : null

  function velg(lop: Konkurranse) {
    const p = new URLSearchParams(params)
    p.set('lop', String(lop.eventor_id))
    setParams(p, { replace: true })
  }

  const x = utvalg.map((l) => dagerMellom(fra, l.dato))
  const xDomene: [number, number] = [0, Math.max(1, dagerMellom(fra, til))]
  const xMerker = () => lagXMerker(fra, til, alle)
  const bak = utvalg.map((l) => l.prosent_bak)
  const fart = utvalg.map((l) => l.strekkfart)
  const harFart = fart.some((v) => v != null)
  const maksBak = Math.max(5, ...bak.filter((v): v is number => v != null))

  const tips = (i: number) => {
    const l = utvalg[i]
    return (
      <>
        <b>{l.navn}</b>
        <span className="tips-rad dempet">
          {dato(l.dato, 'd. MMM yyyy')} · {disiplinTekst(l)} · {l.klasse}
        </span>
        <span className="tips-tall">
          {l.prosent_bak != null ? `${prosent(l.prosent_bak)} bak` : l.status} · {plassTekst(l)}
        </span>
        {l.strekkfart != null && (
          <span className="tips-rad">
            Strekkfart <span className="tips-verdi">{indeks(l.strekkfart)}</span>
          </span>
        )}
        {l.bomtid_s != null && l.bomtid_s > 0 && (
          <span className="tips-rad">
            Bomtid <span className="tips-verdi">{klokke(l.bomtid_s)}</span>
          </span>
        )}
      </>
    )
  }

  const tabell = () => (
    <table className="arstabell konk-tabell">
      <thead>
        <tr>
          <th scope="col">Dato</th>
          <th scope="col" className="tekst">Løp</th>
          <th scope="col" className="tekst">Disiplin</th>
          <th scope="col" className="tekst">Klasse</th>
          <th scope="col">Plass</th>
          <th scope="col">Bak vinner</th>
          <th scope="col">Strekkfart</th>
          <th scope="col">Bomtid</th>
          <th scope="col" className="tekst">Lenker</th>
        </tr>
      </thead>
      <tbody>
        {[...utvalg].reverse().map((l) => (
          <tr key={`${l.eventor_id}-${l.klasse}-${l.dato}-${l.tid_s}`} className={l === valgt ? 'valgt' : undefined}>
            <th scope="row">
              <Link to={`/?uke=${ukeForDato(l.dato)}`}>{dato(l.dato, 'd.M.yy')}</Link>
            </th>
            <td className="tekst">
              <button type="button" className="tabellvalg" aria-pressed={l === valgt} onClick={() => velg(l)}>
                {l.navn}
              </button>
            </td>
            <td className="tekst">{disiplinTekst(l)}</td>
            <td className="tekst">{l.klasse}</td>
            <td>{plassTekst(l)}</td>
            <td>{prosent(l.prosent_bak)}</td>
            <td>{indeks(l.strekkfart)}</td>
            <td>{l.bomtid_s != null ? klokke(l.bomtid_s) : '–'}</td>
            <td className="tekst">
              <Lenker lenker={l.lenker} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="konkurranser">
      <div className="del-hode">
        <h1>Konkurranser</h1>
        <Segment
          etikett="Periode"
          verdi={periode}
          onEndre={setPeriode}
          valg={[
            { id: 'sesong', navn: k.valgt.navn },
            { id: 'alle', navn: 'Alle sesonger' },
          ]}
        />
      </div>
      <div className="konk-filter">
        <Segment etikett="Idrett" verdi={type} onEndre={setType} valg={typer.map((t) => ({ id: t, navn: TYPE_NAVN[t] }))} />
        {disipliner.length > 1 && (
          <Segment
            etikett="Disiplin"
            verdi={disiplin}
            onEndre={setDisiplin}
            valg={[{ id: 'alle' as const, navn: 'Alle' }, ...disipliner.map((d) => ({ id: d, navn: DISIPLIN_NAVN[d] }))]}
          />
        )}
      </div>

      <Grafkort
        tittel="Prosent bak vinner"
        forklaring={
          <>
            Ett punkt per løp. Aksen er snudd, så høyere er bedre, og øverst er 0 % (seier). Løp som ikke ble fullført, er bare med i
            tabellen. Klikk et punkt for å se oppkjøringen.
            {type === 'pre-o' && ' I tempO er avstanden til vinneren ofte stor og kan ikke sammenlignes med o-løp.'}
          </>
        }
        forklaringTabell={
          <>
            Alle løp i utvalget, nyeste først, også de som ikke ble fullført. Velg et løp for å se oppkjøringen, eller datoen for å åpne uka i dagboka.
            {type === 'pre-o' && ' I tempO er avstanden til vinneren ofte stor og kan ikke sammenlignes med o-løp.'}
          </>
        }
        tabell={tabell}
      >
        {utvalg.length === 0 ? (
          <p className="tomt">Ingen løp i utvalget {alle ? '' : `i sesongen ${k.valgt.navn}`}.</p>
        ) : (
          <>
            <Tidsserie
              x={x}
              xDomene={xDomene}
              serier={[{ id: 'bak', navn: 'Prosent bak', verdier: bak, klasse: 'ts-konk', form: 'punkt' }]}
              punktRadius={3.5}
              snuY
              yDomene={[0, maksBak]}
              hoyde={220}
              xMerker={xMerker}
              yFormat={(v) => `${v} %`}
              aktiv={aktiv}
              onAktiv={setAktiv}
              valgt={valgtIndeks >= 0 ? valgtIndeks : null}
              onKlikk={(i) => velg(utvalg[i])}
              beskrivelse="Prosent bak vinner per løp, høyere er bedre"
              tips={tips}
            />
            {harFart && (
              <>
                <h3 className="grafkort-undertittel">Strekkfart uten bom (1,00 = snittet av de tre beste per strekk)</h3>
                <Tidsserie
                  x={x}
                  xDomene={xDomene}
                  serier={[
                    { id: 'ref', navn: 'Referanse', verdier: x.map(() => 1), klasse: 'ts-ref', form: 'linje' },
                    { id: 'fart', navn: 'Strekkfart', verdier: fart, klasse: 'ts-konk', form: 'punkt' },
                  ]}
                  punktRadius={3.5}
                  snuY
                  hoyde={160}
                  xMerker={xMerker}
                  yFormat={(v) => v.toLocaleString('nb-NO', { minimumFractionDigits: 2 })}
                  aktiv={aktiv}
                  onAktiv={setAktiv}
                  valgt={valgtIndeks >= 0 ? valgtIndeks : null}
                  onKlikk={(i) => velg(utvalg[i])}
                  beskrivelse="Strekkfart per løp, høyere er bedre"
                  tips={tips}
                />
              </>
            )}
            <Tegnforklaring
              serier={[
                { id: 'lop', navn: 'Løp', klasse: 'prikk-konk' },
                { id: 'valgt', navn: 'Valgt løp', klasse: 'ring-valgt' },
              ]}
            />
          </>
        )}
      </Grafkort>

      {valgt && <Oppkjoringsdel k={k} lop={valgt} utvalg={utvalg} />}

      {stafetter.length > 0 && <Stafettabell stafetter={stafetter} />}
    </div>
  )
}

function Oppkjoringsdel({ k, lop, utvalg }: { k: Analysekontekst; lop: Konkurranse; utvalg: Konkurranse[] }) {
  const { dagbok } = k
  const denne = useMemo(() => oppkjoring(dagbok, lop.dato), [dagbok, lop.dato])
  const snittet = useMemo(() => snittOppkjoring(utvalg.map((l) => oppkjoring(dagbok, l.dato))), [dagbok, utvalg])
  const okter = lop.okt_ider.map((id) => dagbok.oktPerId.get(id)).filter((o) => !!o)

  const rader: { navn: string; f: (o: Oppkjoring | typeof snittet) => string; vis?: boolean }[] = [
    { navn: 'Timer', f: (o) => (o.minutter == null ? '–' : timer(o.minutter)) },
    { navn: 'Økter', f: (o) => en(o.okter, 1) },
    { navn: 'Km løping', f: (o) => (o.km == null ? '–' : km(o.km)) },
    { navn: 'Tid i I3–I5', f: (o) => (o.harde_min == null ? '–' : timer(o.harde_min)) },
    { navn: 'Kvalitetsøkter', f: (o) => en(o.kvalitetsokter, 1) },
    { navn: 'Andre løp', f: (o) => en(o.konkurranser, 1) },
    { navn: 'Syke- og skadedager', f: (o) => en(o.sykedager == null || o.skadedager == null ? null : o.sykedager + o.skadedager, 1) },
    { navn: 'Akutt belastning, snitt', f: (o) => en(o.belastning_akutt), vis: denne.belastning_akutt != null },
    { navn: 'Akutt belastning dagen før', f: (o) => en(o.belastning_dagen_for), vis: denne.belastning_dagen_for != null },
    { navn: 'HRV om natta, snitt (ms)', f: (o) => en(o.hrv), vis: denne.hrv != null },
    { navn: 'Hvilepuls, snitt', f: (o) => en(o.hvilepuls, 1), vis: denne.hvilepuls != null },
  ]

  return (
    <section className="grafkort oppkjoring" aria-labelledby="oppkjoring-tittel">
      <header className="grafkort-hode">
        <div>
          <h2 id="oppkjoring-tittel">
            Oppkjøring til {lop.navn}, {dato(lop.dato, 'd. MMM yyyy')}
          </h2>
          <p className="grafkort-forklaring">
            De {OPPKJORING_DAGER} dagene før løpet ({dato(denne.fra, 'd. MMM')}–{dato(denne.til, 'd. MMM')}), sammenlignet med snittet for de{' '}
            {utvalg.length} løpene i utvalget. Belastning og HRV finnes fra høsten 2023.
          </p>
        </div>
      </header>

      <dl className="nokkeltall konk-nokler">
        <div>
          <dt>Plass</dt>
          <dd>{plassTekst(lop)}</dd>
        </div>
        <div>
          <dt>Bak vinner</dt>
          <dd>
            {prosent(lop.prosent_bak)}
            {lop.tid_s != null && lop.vinnertid_s != null && lop.tid_s > lop.vinnertid_s && <small> +{klokke(lop.tid_s - lop.vinnertid_s)}</small>}
          </dd>
        </div>
        <div>
          <dt>Strekkfart</dt>
          <dd>{indeks(lop.strekkfart)}</dd>
        </div>
        <div>
          <dt>Bomtid</dt>
          <dd>{lop.bomtid_s != null ? klokke(lop.bomtid_s) : '–'}</dd>
        </div>
      </dl>
      {lop.strekk_ugyldige && lop.tid_s != null && <p className="fotnote">{UGYLDIGE_STREKK}</p>}
      <p className="konk-meta">
        {disiplinTekst(lop)} · {lop.klasse} · {lop.arrangor}
        <br />
        <Link to={`/?uke=${ukeForDato(lop.dato)}`}>Uka i dagboka</Link>
        {okter.map((o) => (
          <span key={o.id}>
            {' · '}
            <Link to={`/okt/${o.id}`}>{o.navn}</Link>
          </span>
        ))}
        {' · '}
        <Lenker lenker={lop.lenker} />
      </p>

      <div className="tabellrull">
        <table className="nokkeltabell">
          <thead>
            <tr>
              <th scope="col">
                <span className="skjult">Mål</span>
              </th>
              <th scope="col">Dette løpet</th>
              <th scope="col">Snitt i utvalget</th>
            </tr>
          </thead>
          <tbody>
            {rader
              .filter((r) => r.vis !== false)
              .map((r) => (
                <tr key={r.navn}>
                  <th scope="row">{r.navn}</th>
                  <td className="stor">{r.f(denne)}</td>
                  <td>{r.f(snittet)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Stafettabell({ stafetter }: { stafetter: Stafett[] }) {
  return (
    <section className="analyse-del">
      <h2>Stafetter</h2>
      <p className="hint">Stafettene har ingen strekkanalyse ennå.</p>
      <div className="tabellrull">
        <table className="arstabell konk-tabell">
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col" className="tekst">Løp</th>
              <th scope="col" className="tekst">Klasse</th>
              <th scope="col">Etappe</th>
              <th scope="col">Plass</th>
              <th scope="col" className="tekst">Lenker</th>
            </tr>
          </thead>
          <tbody>
            {[...stafetter].reverse().map((s) => (
              <tr key={`${s.eventor_id}-${s.klasse}-${s.etappe}`}>
                <th scope="row">
                  <Link to={`/?uke=${ukeForDato(s.dato)}`}>{dato(s.dato, 'd.M.yy')}</Link>
                </th>
                <td className="tekst">{s.navn}</td>
                <td className="tekst">{s.klasse}</td>
                <td>{s.etappe}</td>
                <td>{s.status === 'OK' ? (s.plass ?? '–') : s.status}</td>
                <td className="tekst">
                  <Lenker lenker={s.lenker} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
