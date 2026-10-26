/**
 * Visningsvalg i URL-en (periode, oppløsning, filter, graf eller tabell), så Tilbake-knappen
 * gir siden slik den var. Standardverdier står ikke i URL-en, så lenkene holder seg korte.
 */

/** Verdien til `nokkel`, eller `standard` hvis den mangler eller ikke er gyldig. */
export function lesVerdi<T extends string>(params: URLSearchParams, nokkel: string, standard: T, gyldige?: readonly T[]): T {
  const v = params.get(nokkel)
  if (v == null || v === '') return standard
  if (gyldige && !gyldige.includes(v as T)) return standard
  return v as T
}

/** Nye parametre med `nokkel` satt til `verdi`, eller fjernet når verdien er standard. */
export function medVerdi(params: URLSearchParams, nokkel: string, verdi: string, standard: string): URLSearchParams {
  const p = new URLSearchParams(params)
  if (verdi === standard) p.delete(nokkel)
  else p.set(nokkel, verdi)
  return p
}

/** En kommaseparert liste, f.eks. `tabell=sovn,hvilepuls`. */
export function lesListe(params: URLSearchParams, nokkel: string): string[] {
  return (params.get(nokkel) ?? '').split(',').filter(Boolean)
}

/** Nye parametre med `id` lagt til eller tatt ut av lista. En tom liste fjernes. */
export function medIListe(params: URLSearchParams, nokkel: string, id: string, med: boolean): URLSearchParams {
  const liste = lesListe(params, nokkel).filter((x) => x !== id)
  if (med) liste.push(id)
  const p = new URLSearchParams(params)
  if (liste.length) p.set(nokkel, liste.join(','))
  else p.delete(nokkel)
  return p
}
