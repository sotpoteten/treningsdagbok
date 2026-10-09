import type { Dag, Okt, Profil, UkeRad } from './typer'
import { byggUker, ukeNokkel, type Uke } from './uker'

export const DAGBOK_FRA = '2019-11-01'

export interface Dagbok {
  okter: Okt[] // kronologisk
  oktPerId: Map<string, Okt>
  okterPerDato: Map<string, Okt[]>
  dagerPerDato: Map<string, Dag>
  uker: Uke[] // nyeste først
  profil: Profil
}

async function hent<T>(fil: string): Promise<T> {
  const svar = await fetch(`${import.meta.env.BASE_URL}data/${fil}`)
  if (!svar.ok) throw new Error(`Fant ikke data/${fil} (${svar.status}). Kjør «npm run data».`)
  return svar.json() as Promise<T>
}

export function byggDagbok(raOkter: Okt[], dager: Dag[], ukerader: UkeRad[], profil: Profil): Dagbok {
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

  return {
    okter,
    oktPerId: new Map(okter.map((o) => [o.id, o])),
    okterPerDato,
    dagerPerDato,
    uker: byggUker(DAGBOK_FRA, sisteDato, okterPerDato, dagerPerDato, kommentarerPerUke),
    profil,
  }
}

export async function lastDagbok(): Promise<Dagbok> {
  const [okter, dager, uker, profil] = await Promise.all([
    hent<Okt[]>('okter.json'),
    hent<Dag[]>('dager.json'),
    hent<UkeRad[]>('uker.json'),
    hent<Profil>('profil.json'),
  ])
  return byggDagbok(okter, dager, uker, profil)
}
