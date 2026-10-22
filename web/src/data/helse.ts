import type { GarminAktivitet, GarminDag, GarminMaling } from './typer'
import { isoDato } from './uker'

/**
 * Avledede helsetall, regnet på samme måte for hele dagboka uansett om målingene kom fra
 * Garmins GDPR-eksport eller fra intervals.icu. Filene har bare det som er målt.
 */

/** Antall netter normalområdet for HRV regnes ut fra, og hvor mange av dem som må ha en måling. */
export const HRV_VINDU = 60
export const HRV_MIN_NETTER = 20
/** Akutt belastning er summen av de siste 7 dagene, kronisk er snittet per uke de siste 28. */
export const AKUTT_DAGER = 7
export const KRONISK_DAGER = 28

const rund = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d

function nesteDag(dato: string): string {
  const d = new Date(`${dato}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return isoDato(d)
}

/**
 * Én post per dag fra første til siste dag med måling eller belastning, med:
 * - `hrv_ukesnitt`: snittet av HRV de siste 7 nettene (minst 3 målinger).
 * - `hrv_normal_lav/hoy`: exp(snitt ± 1 SD) av ln(HRV) de foregående 60 nettene, med minst
 *   20 målinger. Natta selv er ikke med, så en uvanlig natt kan falle utenfor.
 * - `belastning_akutt/kronisk` og `acwr`: fra Garmins belastning per aktivitet. Dager uten
 *   aktivitet teller som 0, men tallene begynner først når den første aktiviteten har belastning.
 */
export function avledHelse(malinger: GarminMaling[], aktiviteter: GarminAktivitet[]): GarminDag[] {
  const perDato = new Map(malinger.map((m) => [m.dato, m]))
  const lastPerDato = new Map<string, number>()
  for (const a of aktiviteter) {
    if (a.belastning == null) continue
    const d = a.start_lokal.slice(0, 10)
    lastPerDato.set(d, (lastPerDato.get(d) ?? 0) + a.belastning)
  }
  const datoer = [...perDato.keys(), ...lastPerDato.keys()].sort()
  if (!datoer.length) return []
  const forsteLast = [...lastPerDato.keys()].sort()[0]

  const ut: GarminDag[] = []
  const hrv: (number | null)[] = []
  const last: number[] = []
  for (let d = datoer[0]; d <= datoer[datoer.length - 1]; d = nesteDag(d)) {
    const m = perDato.get(d)
    const dag: GarminDag = { dato: d, ...m }

    const forrige = hrv.slice(-HRV_VINDU).filter((v): v is number => v != null)
    if (forrige.length >= HRV_MIN_NETTER) {
      const ln = forrige.map(Math.log)
      const snitt = ln.reduce((a, b) => a + b, 0) / ln.length
      const sd = Math.sqrt(ln.reduce((a, b) => a + (b - snitt) ** 2, 0) / (ln.length - 1))
      dag.hrv_normal_lav = rund(Math.exp(snitt - sd))
      dag.hrv_normal_hoy = rund(Math.exp(snitt + sd))
    }
    hrv.push(m?.hrv_natt ?? null)
    const uke = hrv.slice(-7).filter((v): v is number => v != null)
    if (uke.length >= 3) dag.hrv_ukesnitt = rund(uke.reduce((a, b) => a + b, 0) / uke.length)

    if (forsteLast && d >= forsteLast) {
      last.push(lastPerDato.get(d) ?? 0)
      const akutt = last.slice(-AKUTT_DAGER).reduce((a, b) => a + b, 0)
      const kronisk = last.slice(-KRONISK_DAGER).reduce((a, b) => a + b, 0) / (KRONISK_DAGER / 7)
      dag.belastning_akutt = Math.round(akutt)
      dag.belastning_kronisk = Math.round(kronisk)
      // ACWR gir mening først når den kroniske perioden er fylt opp.
      if (last.length >= KRONISK_DAGER && kronisk > 0) dag.acwr = rund(akutt / kronisk, 2)
    }
    ut.push(dag)
  }
  return ut
}
