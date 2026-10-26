import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { lesListe, lesVerdi, medIListe, medVerdi } from '../data/urltilstand'

/**
 * Som useState, men verdien ligger i URL-en (`?nokkel=verdi`). Endringer erstatter
 * historikkoppføringen, så de gir ingen ekstra steg for Tilbake-knappen.
 */
export function useUrlTilstand<T extends string>(nokkel: string, standard: T, gyldige?: readonly T[]): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams()
  const verdi = lesVerdi(params, nokkel, standard, gyldige)
  const sett = useCallback(
    (v: T) => setParams((p) => medVerdi(p, nokkel, v, standard), { replace: true }),
    [setParams, nokkel, standard],
  )
  return [verdi, sett]
}

/** Om `id` står i lista `nokkel` i URL-en, f.eks. et grafkort i tabellvisning (`?tabell=sovn`). */
export function useUrlFlagg(nokkel: string, id: string): [boolean, (vis: boolean) => void] {
  const [params, setParams] = useSearchParams()
  const verdi = lesListe(params, nokkel).includes(id)
  const sett = useCallback(
    (vis: boolean) => setParams((p) => medIListe(p, nokkel, id, vis), { replace: true }),
    [setParams, nokkel, id],
  )
  return [verdi, sett]
}
