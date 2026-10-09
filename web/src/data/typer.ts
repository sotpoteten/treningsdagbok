// Speiler formatet som scripts/konverter.py skriver (se CLAUDE.md).

export const SONER = ['I1', 'I2', 'I3', 'I4', 'I5'] as const
export type Sone = (typeof SONER)[number]
export type SoneMin = Partial<Record<Sone, number>>

export type Kategori = 'bevegelse' | 'o-teknikk' | 'styrke' | 'bevegelighet'

export interface Blokk {
  posisjon: number
  aktivitet_id: number
  aktivitet: string
  kategori: Kategori
  soner: SoneMin
  distanse_km: number | null
  minutter: number
}

export interface Okt {
  id: string
  dato: string // ÅÅÅÅ-MM-DD
  rekkefolge: number
  navn: string
  beskrivelse: string | null
  kommentar: string | null
  kommentarer_andre: string[]
  varighet_min: number
  hoyeste_sone: Sone | null
  hoyeste_sone_registrert: Sone | null
  sone_min: SoneMin
  distanse_km: number
  loping_min: number
  otek_min: number
  styrke_min: number
  opplevd_belastning: number | null
  dagsform: number | null
  blokker: Blokk[]
  /** Fylles inn senere når Garmin-eksporten er koblet på. */
  garmin_id?: number | null
}

export interface Sykdom {
  symptomer: string[]
  kommentar: string | null
  pavirkning_deltagelse: string | null
  pavirkning_prestasjon: string | null
}

export interface Skade {
  type: string | null
  kroppsdel: string | null
  kommentar: string | null
  pavirkning_deltagelse: string | null
  pavirkning_prestasjon: string | null
}

export interface Dag {
  dato: string
  syk: boolean
  skadet: boolean
  reise: boolean
  hoyde: boolean
  fridag: boolean
  konkurranse: boolean
  notat: string | null
  sykdom: Sykdom | null
  skade: Skade[] | null
}

export interface Ukekommentar {
  tekst: string
  skrevet: string
  egen: boolean
}

export interface UkeRad {
  ar: number
  uke: number
  mandag: string
  kommentarer: Ukekommentar[]
}

export interface Profil {
  navn: string
  idrett: string
  forbund: string
  klubb: string
  pulssoner: Record<Sone, { Min: number; Max: number }> & { enhet: string; sist_oppdatert: string }
}
