import { summer } from './aggregat'
import type { Dagbok } from './last'
import { erKvalitet, hardeMinutter, snitt } from './statistikk'
import type { Disiplin, Konkurranse, Konkurransetype, Okt } from './typer'
import { isoDato } from './uker'

// Konkurransene fra Eventor: utvalg og oppkjøringen før et løp.
// Prosent bak vinner er hovedmålet. Strekkfart (1,0 = snittet av de tre beste per strekk)
// finnes bare når Eventor har strekktider.

export const TYPE_NAVN: Record<Konkurransetype, string> = {
  'o-løp': 'O-løp',
  'ski-o': 'Ski-o',
  'sykkel-o': 'Sykkel-o',
  'pre-o': 'Pre-o',
}
export const TYPER = Object.keys(TYPE_NAVN) as Konkurransetype[]

export const DISIPLIN_NAVN: Record<Disiplin, string> = {
  sprint: 'Sprint',
  mellom: 'Mellom',
  lang: 'Lang',
  ultralang: 'Ultralang',
  tempo: 'TempO',
}
export const DISIPLINER = Object.keys(DISIPLIN_NAVN) as Disiplin[]

export interface Utvalg {
  type?: Konkurransetype
  disiplin?: Disiplin
  /** Begge datoene er med. */
  fra?: string
  til?: string
}

/** Løpene som passer utvalget, i samme rekkefølge som lista. */
export function filtrer(liste: Konkurranse[], u: Utvalg): Konkurranse[] {
  return liste.filter(
    (k) =>
      (!u.type || k.type === u.type) &&
      (!u.disiplin || k.disiplin === u.disiplin) &&
      (!u.fra || k.dato >= u.fra) &&
      (!u.til || k.dato <= u.til),
  )
}

/** Typene og disiplinene som faktisk finnes, i fast rekkefølge. */
export function typerIBruk(liste: Konkurranse[]): Konkurransetype[] {
  const finnes = new Set(liste.map((k) => k.type))
  return TYPER.filter((t) => finnes.has(t))
}
export function disiplinerIBruk(liste: Konkurranse[]): Disiplin[] {
  const finnes = new Set(liste.map((k) => k.disiplin))
  return DISIPLINER.filter((d) => finnes.has(d))
}

/** «Lang · natt» */
export function disiplinTekst(k: Pick<Konkurranse, 'disiplin' | 'natt'>): string {
  return k.natt ? `${DISIPLIN_NAVN[k.disiplin]} · natt` : DISIPLIN_NAVN[k.disiplin]
}

/** Sekunder som «57:22» eller «1:05:03». */
export function klokke(s: number): string {
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sek = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sek}` : `${m}:${sek}`
}

const komma = (v: number, d: number) => v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d })
/** 10.2 → «10,2 %» */
export const prosent = (v: number | null) => (v == null ? '–' : `${komma(v, 1)} %`)
/** 1.062 → «1,062» */
export const indeks = (v: number | null, d = 3) => (v == null ? '–' : komma(v, d))

/** Plass av antall, eller status når løpet ikke ble fullført. */
export function plassTekst(k: Pick<Konkurranse, 'plass' | 'antall' | 'status'>): string {
  if (k.status !== 'OK' || k.plass == null) return k.status === 'OK' ? '–' : k.status
  return `${k.plass} av ${k.antall}`
}

// ── Oppkjøringen ────────────────────────────────────────

export const OPPKJORING_DAGER = 21

function dagerFor(dato: string, n: number): string[] {
  const ut: string[] = []
  const d = new Date(`${dato}T12:00:00Z`)
  for (let i = n; i >= 1; i--) {
    const x = new Date(d)
    x.setUTCDate(d.getUTCDate() - i)
    ut.push(isoDato(x))
  }
  return ut
}

export interface Oppkjoring {
  fra: string
  til: string
  okter: number
  minutter: number
  km: number
  /** Minutter i I3–I5. */
  harde_min: number
  kvalitetsokter: number
  /** Andre løp (individuelle) i perioden. */
  konkurranser: number
  sykedager: number
  skadedager: number
  /** Snitt av Garmins akutte belastning (7 dager) per dag i perioden. */
  belastning_akutt: number | null
  /** Akutt belastning dagen før løpet. */
  belastning_dagen_for: number | null
  hrv: number | null
  hvilepuls: number | null
}

/**
 * Treningen og helsetallene de 21 dagene før løpet (løpsdagen er ikke med).
 * Summene følger reglene i aggregat.ts; helsetallene er snitt av dagene som har måling.
 */
export function oppkjoring(dagbok: Dagbok, dato: string, n = OPPKJORING_DAGER): Oppkjoring {
  const dager = dagerFor(dato, n)
  const okter: Okt[] = dager.flatMap((d) => dagbok.okterPerDato.get(d) ?? [])
  const sum = summer(okter)
  const helse = dager.map((d) => dagbok.helsePerDato.get(d))
  const rapporter = dager.map((d) => dagbok.dagerPerDato.get(d))
  const fra = dager[0]
  const til = dager[dager.length - 1]
  return {
    fra,
    til,
    okter: sum.okter,
    minutter: sum.minutter,
    km: sum.km,
    harde_min: okter.reduce((a, o) => a + hardeMinutter(o), 0),
    kvalitetsokter: okter.filter(erKvalitet).length,
    konkurranser: dagbok.konkurranser.filter((k) => k.dato >= fra && k.dato <= til).length,
    sykedager: rapporter.filter((r) => r?.syk).length,
    skadedager: rapporter.filter((r) => r?.skadet).length,
    belastning_akutt: snitt(helse.map((h) => h?.belastning_akutt)),
    belastning_dagen_for: helse[helse.length - 1]?.belastning_akutt ?? null,
    hrv: snitt(helse.map((h) => h?.hrv_natt)),
    hvilepuls: snitt(helse.map((h) => h?.hvilepuls)),
  }
}

/** Snittet av oppkjøringene, felt for felt (null-verdier hoppes over). */
export function snittOppkjoring(liste: Oppkjoring[]): Record<Exclude<keyof Oppkjoring, 'fra' | 'til'>, number | null> {
  const felt = (f: (o: Oppkjoring) => number | null) => snitt(liste.map(f))
  return {
    okter: felt((o) => o.okter),
    minutter: felt((o) => o.minutter),
    km: felt((o) => o.km),
    harde_min: felt((o) => o.harde_min),
    kvalitetsokter: felt((o) => o.kvalitetsokter),
    konkurranser: felt((o) => o.konkurranser),
    sykedager: felt((o) => o.sykedager),
    skadedager: felt((o) => o.skadedager),
    belastning_akutt: felt((o) => o.belastning_akutt),
    belastning_dagen_for: felt((o) => o.belastning_dagen_for),
    hrv: felt((o) => o.hrv),
    hvilepuls: felt((o) => o.hvilepuls),
  }
}
