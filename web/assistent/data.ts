import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { byggDagbok, type Dagbok } from '../src/data/last'
import type { GarminSpor, Runde } from '../src/data/typer'

const les = <T>(sti: string): T => JSON.parse(readFileSync(sti, 'utf-8')) as T
const lesValgfri = <T>(sti: string): T | undefined => (existsSync(sti) ? les<T>(sti) : undefined)

/** Leser de ryddige filene i `data/` og bygger samme dagbok som nettsiden bruker. */
export function lesDagbok(datamappe: string): Dagbok {
  const f = (navn: string) => join(datamappe, navn)
  return byggDagbok(
    les(f('okter.json')),
    les(f('dager.json')),
    les(f('uker.json')),
    les(f('profil.json')),
    lesValgfri(f('garmin_aktiviteter.json')),
    lesValgfri(f('garmin_helse.json')),
    null,
    lesValgfri(f('konkurranser.json')) ?? null,
  )
}

/** Rundene fra en sporfil. Koordinatene i fila leses ikke videre. */
export function lagRundeleser(datamappe: string) {
  return (garminId: number): Runde[] | null => {
    const sti = join(datamappe, 'garmin_spor', `${garminId}.json`)
    if (!existsSync(sti)) return null
    return les<GarminSpor>(sti).runder ?? null
  }
}
