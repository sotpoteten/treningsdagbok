import { addDays, getISOWeek, getISOWeekYear, parseISO, startOfISOWeek } from 'date-fns'
import type { Dag, Okt, UkeRad } from './typer'

/** Lokal dato som ÅÅÅÅ-MM-DD (uten tidssoneforskyvning). */
export function isoDato(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dag = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dag}`
}

export function ukeNokkel(ar: number, uke: number): string {
  return `${ar}-${String(uke).padStart(2, '0')}`
}

/** ISO-uke-nøkkelen for en dato, f.eks. «2026-40». */
export function ukeForDato(iso: string): string {
  const d = parseISO(iso)
  return ukeNokkel(getISOWeekYear(d), getISOWeek(d))
}

export interface Ukedag {
  dato: string
  okter: Okt[]
  rapport: Dag | null
}

export interface Uke {
  nokkel: string
  ar: number // ISO-uke-år
  uke: number
  mandag: string
  sondag: string
  dager: Ukedag[] // alltid 7, mandag først
  okter: Okt[]
  kommentarer: UkeRad['kommentarer']
}

/** Alle ISO-uker fra uka med `fra` til uka med `til`, nyeste først. Tomme uker tas med. */
export function byggUker(
  fra: string,
  til: string,
  okterPerDato: Map<string, Okt[]>,
  dagerPerDato: Map<string, Dag>,
  kommentarerPerUke: Map<string, UkeRad>,
): Uke[] {
  const uker: Uke[] = []
  let mandag = startOfISOWeek(parseISO(fra))
  const slutt = parseISO(til)
  while (mandag <= slutt) {
    const ar = getISOWeekYear(mandag)
    const uke = getISOWeek(mandag)
    const nokkel = ukeNokkel(ar, uke)
    const dager: Ukedag[] = []
    for (let i = 0; i < 7; i++) {
      const dato = isoDato(addDays(mandag, i))
      dager.push({
        dato,
        okter: okterPerDato.get(dato) ?? [],
        rapport: dagerPerDato.get(dato) ?? null,
      })
    }
    uker.push({
      nokkel,
      ar,
      uke,
      mandag: dager[0].dato,
      sondag: dager[6].dato,
      dager,
      okter: dager.flatMap((d) => d.okter),
      kommentarer: kommentarerPerUke.get(nokkel)?.kommentarer ?? [],
    })
    mandag = addDays(mandag, 7)
  }
  return uker.reverse()
}
