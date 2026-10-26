/**
 * Rulleposisjoner per historikkoppføring (location.key), lagret i sessionStorage som JSON.
 * Posisjonene er `scrollTop` per rulleflate, med flatens `data-husk-rull`-id som nøkkel.
 */

export type Posisjoner = Record<string, number>
type Lager = [key: string, pos: Posisjoner][]

/** Så mange historikkoppføringer huskes. De eldste glemmes først. */
export const MAKS_OPPFORINGER = 50

function les(raw: string | null): Lager {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (x): x is [string, Posisjoner] => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'object' && x[1] !== null,
    )
  } catch {
    return []
  }
}

/** Posisjonene som er lagret for `key`, eller null. */
export function hentPosisjoner(raw: string | null, key: string): Posisjoner | null {
  const funnet = les(raw).find(([k]) => k === key)
  if (!funnet) return null
  const ut: Posisjoner = {}
  for (const [id, v] of Object.entries(funnet[1])) if (typeof v === 'number' && Number.isFinite(v)) ut[id] = v
  return ut
}

/** Nytt lagerinnhold med posisjonene for `key` lagt sist, og høyst `maks` oppføringer. */
export function lagrePosisjoner(raw: string | null, key: string, pos: Posisjoner, maks = MAKS_OPPFORINGER): string {
  const lager = les(raw).filter(([k]) => k !== key)
  lager.push([key, pos])
  return JSON.stringify(lager.slice(-maks))
}

/** Om flaten er høy nok til å rulle til `mal` (eller så langt den kan, med én pikselsmargin). */
export function kanRulleTil(scrollHeight: number, clientHeight: number, mal: number): boolean {
  return scrollHeight - clientHeight >= mal - 1
}

/** Nøkkelen posisjonene lagres under: ruterens location.key, eller adressen når den er «default». */
export function lagringsnokkel(key: string, adresse: string): string {
  return key === 'default' ? `default:${adresse}` : key
}
