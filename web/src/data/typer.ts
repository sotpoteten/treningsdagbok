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

// ── Garmin (fra scripts/konverter_garmin.py) ───────────

export interface GarminAktivitet {
  garmin_id: number
  navn: string | null
  start_lokal: string // ÅÅÅÅ-MM-DDTtt:mm:ss
  type: string
  varighet_min: number
  distanse_km: number
  snittpuls: number | null
  makspuls: number | null
  hoydemeter: number | null
  kadens: number | null
  aerob_te: number | null
  anaerob_te: number | null
  belastning: number | null
  /** GPS-spor (kart). */
  har_spor: boolean
  /** Sporfila har puls, så kurvene kan vises også uten GPS (mølle, innendørs). */
  har_kurver?: boolean
  okt_id: string | null
}

/** Det som er målt en dag, slik det står i garmin_helse.json. */
export interface GarminMaling {
  dato: string
  hvilepuls?: number
  hrv_natt?: number
  sovn_min?: number
  sovnscore?: number | null
}

/** En dag med målingene og tallene som regnes ut av dem (se avledHelse i helse.ts). */
export interface GarminDag extends GarminMaling {
  hrv_ukesnitt?: number
  hrv_normal_lav?: number
  hrv_normal_hoy?: number
  belastning_akutt?: number
  belastning_kronisk?: number
  acwr?: number
}

export interface Runde {
  start_s: number
  tid_s: number
  dist_m: number | null
  puls: number | null
  makspuls: number | null
  fart: number | null // m/s
}

export interface GarminSpor {
  punkter: {
    t: number[] // sekunder fra start
    lat?: (number | null)[]
    lon?: (number | null)[]
    puls?: (number | null)[]
    fart?: (number | null)[] // m/s
    hoyde?: (number | null)[]
    dist?: (number | null)[] // meter
  }
  runder: Runde[]
}

// ── Konkurranser (fra scripts/hent_eventor.py) ─────────
// Bare Isaks egne resultater. Referansetidene er avledet; andre løpere navngis aldri.

export type Konkurransetype = 'o-løp' | 'ski-o' | 'sykkel-o' | 'pre-o'
export type Disiplin = 'sprint' | 'mellom' | 'lang' | 'ultralang' | 'tempo'

export interface Strekk {
  /** Postnummeret, eller «M» for innløpet til mål. */
  post: number | string
  tid_s: number | null
  /** Beste strekktid i klassen (blant topp 10). */
  beste_s: number | null
  /** Snittet av de tre beste strekktidene. */
  ref_s: number | null
  /** tid_s / ref_s */
  indeks: number | null
  /** Indeks over 1,25 × medianen for løpet. */
  bom: boolean
}

export interface Konkurranse {
  eventor_id: number
  dato: string
  navn: string
  arrangor: string
  type: Konkurransetype
  disiplin: Disiplin
  natt: boolean
  klasse: string
  /** OK, DNF, DSQ, NC … */
  status: string
  tid_s: number | null
  plass: number | null
  antall: number
  vinnertid_s: number | null
  prosent_bak: number | null
  strekk: Strekk[] | null
  /** Medianen av indeksene på strekk uten bom (1,0 = referansen). */
  strekkfart: number | null
  /** Tid tapt på bomstrekkene, utover forventet. */
  bomtid_s: number | null
  /** Strekktidene fra Eventor er ødelagte (se hent_eventor.py). Da er strekk, strekkfart og bomtid null, men tiden gjelder. */
  strekk_ugyldige?: boolean
  lenker: { eventor: string; livelox?: string; winsplits?: string }
  okt_ider: string[]
}

export interface Stafett {
  eventor_id: number
  dato: string
  navn: string
  klasse: string
  etappe: number
  status: string
  plass: number | null
  lenker: { eventor: string; livelox?: string; winsplits?: string }
  okt_ider: string[]
}

export interface Konkurranser {
  individuelle: Konkurranse[]
  stafett: Stafett[]
}
