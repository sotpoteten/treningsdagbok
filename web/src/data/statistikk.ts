import { summer, summerEtter, tomSum, type Sum } from './aggregat'
import type { Dagbok } from './last'
import type { Dag, Okt } from './typer'
import type { Uke } from './uker'

// Treningsåret går fra 1. november til 31. oktober («2025/26» = 1.11.2025–31.10.2026).

const DAG_MS = 86_400_000
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const fraUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Startåret for sesongen datoen hører til. */
export function sesongStart(dato: string): number {
  const ar = +dato.slice(0, 4)
  return +dato.slice(5, 7) >= 11 ? ar : ar - 1
}

/** «2025/26» */
export function sesong(dato: string): string {
  const s = sesongStart(dato)
  return `${s}/${String(s + 1).slice(2)}`
}
export const perSesong = (o: Okt) => sesong(o.dato)

/** Nøkkel til URL-en: «2025/26» ↔ «2025-26». */
export const sesongTilUrl = (s: string) => s.replace('/', '-')
export const sesongFraUrl = (s: string) => s.replace('-', '/')

export interface Sesong {
  navn: string // «2025/26»
  fra: string // 2025-11-01
  til: string // 2026-10-31
  dager: number // 365 eller 366
}

export function lagSesong(startAr: number): Sesong {
  const fra = `${startAr}-11-01`
  const til = `${startAr + 1}-10-31`
  return { navn: `${startAr}/${String(startAr + 1).slice(2)}`, fra, til, dager: (utc(til) - utc(fra)) / DAG_MS + 1 }
}

/** Dag 0 = 1. november. */
export function sesongDag(dato: string): number {
  return (utc(dato) - utc(`${sesongStart(dato)}-11-01`)) / DAG_MS
}

/** Dato for en gitt dag i sesongen. */
export function datoISesong(s: Sesong, dag: number): string {
  return fraUtc(utc(s.fra) + dag * DAG_MS)
}

/** Alle sesonger med data, eldste først. */
export function sesonger(dagbok: Dagbok): Sesong[] {
  if (!dagbok.okter.length) return []
  const forste = sesongStart(dagbok.okter[0].dato)
  const siste = sesongStart(dagbok.okter[dagbok.okter.length - 1].dato)
  const ut: Sesong[] = []
  for (let a = forste; a <= siste; a++) ut.push(lagSesong(a))
  return ut
}

export function okterISesong(okter: Okt[], s: Sesong): Okt[] {
  return okter.filter((o) => o.dato >= s.fra && o.dato <= s.til)
}

// ── Kumulativt ──────────────────────────────────────────

export type Mal = 'timer' | 'km'

/** Akkumulert verdi ved slutten av hver dag i sesongen (lengde = s.dager). Timer i timer, ikke minutter. */
export function kumulativ(okter: Okt[], s: Sesong, mal: Mal): number[] {
  const perDag = new Array<number>(s.dager).fill(0)
  for (const o of okterISesong(okter, s)) {
    perDag[sesongDag(o.dato)] += mal === 'timer' ? o.varighet_min / 60 : o.distanse_km
  }
  let sum = 0
  return perDag.map((v) => (sum += v))
}

/** Summen for sesongen fra 1. nov. til og med dag `dag` (samme dato som i dag, et annet år). */
export function tilSammeDato(okter: Okt[], s: Sesong, dag: number): Sum {
  const til = datoISesong(s, Math.min(dag, s.dager - 1))
  return summer(okter.filter((o) => o.dato >= s.fra && o.dato <= til))
}

// ── Glidende snitt ──────────────────────────────────────

/** Bakoverskuende snitt over n verdier (færre i starten). */
export function glidendeSnitt(verdier: number[], n: number): number[] {
  const ut: number[] = []
  let sum = 0
  for (let i = 0; i < verdier.length; i++) {
    sum += verdier[i]
    if (i >= n) sum -= verdier[i - n]
    ut.push(sum / Math.min(i + 1, n))
  }
  return ut
}

// ── Kvalitet og konkurranse ─────────────────────────────

/** Minutter i I3–I5 som skal til før en økt regnes som kvalitetsøkt. */
export const KVALITET_TERSKEL_MIN = 10

export function hardeMinutter(o: Okt): number {
  return (o.sone_min.I3 ?? 0) + (o.sone_min.I4 ?? 0) + (o.sone_min.I5 ?? 0)
}

export function erKvalitet(o: Okt): boolean {
  return hardeMinutter(o) >= KVALITET_TERSKEL_MIN
}

// ── Aktivitetsfordeling ─────────────────────────────────

export const AKTIVITETER = ['loping', 'ski', 'sykkel', 'styrke', 'bevegelighet'] as const
export type Aktivitet = (typeof AKTIVITETER)[number]
export const AKTIVITET_NAVN: Record<Aktivitet, string> = {
  loping: 'Løping',
  ski: 'Ski/rulleski',
  sykkel: 'Sykkel/annet',
  styrke: 'Styrke',
  bevegelighet: 'Bevegelighet',
}

export interface Aktivitetsfordeling {
  min: Record<Aktivitet, number>
  /** O-teknikk er en del av løpetiden og er ikke med i summen over. */
  otek: number
}

export function aktivitetsfordeling(okter: Iterable<Okt>): Aktivitetsfordeling {
  const min: Record<Aktivitet, number> = { loping: 0, ski: 0, sykkel: 0, styrke: 0, bevegelighet: 0 }
  let otek = 0
  for (const o of okter) {
    for (const b of o.blokker) {
      const id = b.aktivitet_id
      if (id <= 3) min.loping += b.minutter
      else if (id <= 6) min.ski += b.minutter
      else if (id <= 8) min.sykkel += b.minutter
      else if (id <= 11) otek += b.minutter
      else if (id <= 16) min.styrke += b.minutter
      else min.bevegelighet += b.minutter
    }
  }
  return { min, otek }
}

// ── Uker og perioder ────────────────────────────────────

export interface Ukepunkt {
  uke: Uke
  sum: Sum
  kvalitet: number
  konkurranser: number
  syk: boolean
  skadet: boolean
}

/** Én rad per uke, eldste først, med summer og markører. */
export function ukepunkter(uker: Uke[]): Ukepunkt[] {
  return [...uker].reverse().map((u) => {
    const sum = summer(u.okter)
    return {
      uke: u,
      sum,
      kvalitet: u.okter.filter(erKvalitet).length,
      konkurranser: u.dager.filter((d) => d.rapport?.konkurranse).length,
      syk: u.dager.some((d) => d.rapport?.syk),
      skadet: u.dager.some((d) => d.rapport?.skadet),
    }
  })
}

export interface Manedspunkt {
  maned: string // 2025-11
  sum: Sum
}

export function manedspunkter(okter: Okt[], fra: string, til: string): Manedspunkt[] {
  const sum = summerEtter(okter, (o) => o.dato.slice(0, 7))
  const ut: Manedspunkt[] = []
  let [a, m] = [+fra.slice(0, 4), +fra.slice(5, 7)]
  const slutt = til.slice(0, 7)
  for (;;) {
    const k = `${a}-${String(m).padStart(2, '0')}`
    if (k > slutt) break
    ut.push({ maned: k, sum: sum.get(k) ?? tomSum() })
    if (++m > 12) [a, m] = [a + 1, 1]
  }
  return ut
}

// ── Rekorder ────────────────────────────────────────────

export function toppN<T>(liste: T[], verdi: (t: T) => number, n = 10): T[] {
  return [...liste].sort((a, b) => verdi(b) - verdi(a)).slice(0, n)
}

export interface Rekke {
  dager: number
  fra: string
  til: string
}

/**
 * Lengste rekke med dager som oppfyller `test`, mellom `fra` og `til` (begge med).
 */
export function lengsteRekke(fra: string, til: string, test: (dato: string) => boolean): Rekke | null {
  let beste: Rekke | null = null
  let start: string | null = null
  for (let t = utc(fra); t <= utc(til); t += DAG_MS) {
    const d = fraUtc(t)
    if (test(d)) {
      start ??= d
      const lengde = (t - utc(start)) / DAG_MS + 1
      if (!beste || lengde > beste.dager) beste = { dager: lengde, fra: start, til: d }
    } else start = null
  }
  return beste
}

/** Flest dager på rad med minst én økt. */
export function lengsteTreningsrekke(dagbok: Dagbok, fra: string, til: string): Rekke | null {
  return lengsteRekke(fra, til, (d) => (dagbok.okterPerDato.get(d)?.length ?? 0) > 0)
}

/** Lengste opphold: flest dager på rad uten noen økt. */
export function lengsteOpphold(dagbok: Dagbok, fra: string, til: string): Rekke | null {
  return lengsteRekke(fra, til, (d) => !dagbok.okterPerDato.has(d))
}

// ── Helse ───────────────────────────────────────────────

export interface Helse {
  syk: number
  skadet: number
}

export function helsePerSesong(dager: Iterable<Dag>): Map<string, Helse> {
  const ut = new Map<string, Helse>()
  for (const d of dager) {
    if (!d.syk && !d.skadet) continue
    const k = sesong(d.dato)
    const h = ut.get(k) ?? { syk: 0, skadet: 0 }
    if (d.syk) h.syk++
    if (d.skadet) h.skadet++
    ut.set(k, h)
  }
  return ut
}

/** Endring i prosent, eller null når forrige er 0. */
export function endring(na: number, forrige: number): number | null {
  return forrige ? ((na - forrige) / forrige) * 100 : null
}

