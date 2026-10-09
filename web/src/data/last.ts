import type { Dag, GarminAktivitet, GarminDag, Okt, Profil, UkeRad } from './typer'
import { byggUker, ukeNokkel, type Uke } from './uker'

export const DAGBOK_FRA = '2019-11-01'

export interface Dagbok {
  okter: Okt[] // kronologisk
  oktPerId: Map<string, Okt>
  okterPerDato: Map<string, Okt[]>
  dagerPerDato: Map<string, Dag>
  uker: Uke[] // nyeste først
  profil: Profil
  /** Garmin-data; tomme hvis eksporten ikke er konvertert. */
  garmin: GarminAktivitet[]
  garminPerOkt: Map<string, GarminAktivitet[]>
  helse: GarminDag[] // kronologisk
  helsePerDato: Map<string, GarminDag>
}

/** Valgfri fil: gir null hvis den mangler (Vite kan svare med index.html i stedet for 404). */
async function hentValgfri<T>(fil: string): Promise<T | null> {
  try {
    const svar = await fetch(`${import.meta.env.BASE_URL}data/${fil}`)
    if (!svar.ok) return null
    return (await svar.json()) as T
  } catch {
    return null
  }
}

async function hent<T>(fil: string): Promise<T> {
  const svar = await fetch(`${import.meta.env.BASE_URL}data/${fil}`)
  if (!svar.ok) throw new Error(`Fant ikke data/${fil} (${svar.status}). Kjør «npm run data».`)
  return svar.json() as Promise<T>
}

export function byggDagbok(
  raOkter: Okt[],
  dager: Dag[],
  ukerader: UkeRad[],
  profil: Profil,
  garmin: GarminAktivitet[] = [],
  helse: GarminDag[] = [],
): Dagbok {
  const okter = raOkter
    .filter((o) => o.dato >= DAGBOK_FRA)
    .sort((a, b) => (a.dato === b.dato ? a.rekkefolge - b.rekkefolge : a.dato < b.dato ? -1 : 1))

  const okterPerDato = new Map<string, Okt[]>()
  for (const o of okter) {
    const liste = okterPerDato.get(o.dato)
    if (liste) liste.push(o)
    else okterPerDato.set(o.dato, [o])
  }

  const dagerPerDato = new Map(dager.map((d) => [d.dato, d]))
  const kommentarerPerUke = new Map(ukerader.map((u) => [ukeNokkel(u.ar, u.uke), u]))
  const sisteDato = okter.length ? okter[okter.length - 1].dato : DAGBOK_FRA

  const garminPerOkt = new Map<string, GarminAktivitet[]>()
  for (const a of garmin) {
    if (!a.okt_id) continue
    const liste = garminPerOkt.get(a.okt_id)
    if (liste) liste.push(a)
    else garminPerOkt.set(a.okt_id, [a])
  }
  for (const liste of garminPerOkt.values()) liste.sort((a, b) => (a.start_lokal < b.start_lokal ? -1 : 1))
  const helseSortert = [...helse].sort((a, b) => (a.dato < b.dato ? -1 : 1))

  return {
    okter,
    oktPerId: new Map(okter.map((o) => [o.id, o])),
    okterPerDato,
    dagerPerDato,
    uker: byggUker(DAGBOK_FRA, sisteDato, okterPerDato, dagerPerDato, kommentarerPerUke),
    profil,
    garmin,
    garminPerOkt,
    helse: helseSortert,
    helsePerDato: new Map(helseSortert.map((d) => [d.dato, d])),
  }
}

export async function lastDagbok(): Promise<Dagbok> {
  const [okter, dager, uker, profil, garmin, helse] = await Promise.all([
    hent<Okt[]>('okter.json'),
    hent<Dag[]>('dager.json'),
    hent<UkeRad[]>('uker.json'),
    hent<Profil>('profil.json'),
    hentValgfri<GarminAktivitet[]>('garmin_aktiviteter.json'),
    hentValgfri<GarminDag[]>('garmin_helse.json'),
  ])
  return byggDagbok(okter, dager, uker, profil, garmin ?? [], helse ?? [])
}
