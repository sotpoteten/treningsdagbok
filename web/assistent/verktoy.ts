import { summer, type Sum } from '../src/data/aggregat'
import { lagTreff, type Filtertype } from '../src/data/filter'
import { filtrer, oppkjoring } from '../src/data/konkurranser'
import type { Dagbok } from '../src/data/last'
import { aktivitetsfordeling, erKvalitet, hardeMinutter, lagSesong, sesongStart, sesonger, snitt } from '../src/data/statistikk'
import type { Disiplin, GarminDag, Konkurranse, Konkurransetype, Okt, Runde } from '../src/data/typer'
import { ukeForDato } from '../src/data/uker'

// Verktøyene assistenten henter tall med. Rene funksjoner over dagboka, så de kan testes
// mot kontrolltallene. Svarene er kompakte, har tak på antall rader og inneholder aldri
// GPS-koordinater.

const DAG_MS = 86_400_000
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const fraUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const r1 = (v: number) => Math.round(v * 10) / 10
const r1n = (v: number | null) => (v == null ? null : r1(v))
const UKEDAGER = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør']

function* datoer(fra: string, til: string): Generator<string> {
  for (let t = utc(fra); t <= utc(til); t += DAG_MS) yield fraUtc(t)
}

/** Feil som skal tilbake til modellen som tekst, så den kan prøve på nytt. */
export class Verktoyfeil extends Error {}

function sjekkDatoer(fra: string, til: string) {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (!iso.test(fra) || !iso.test(til)) throw new Verktoyfeil('Datoer må skrives som ÅÅÅÅ-MM-DD.')
  if (fra > til) throw new Verktoyfeil('«fra» må være før eller lik «til».')
}

// ── perioder ────────────────────────────────────────────

export type Opplosning = 'uke' | 'maned' | 'sesong' | 'ar'
export const MAKS_PERIODER = 160

interface Bolk {
  periode: string
  fra: string
  til: string
}

function bolker(dagbok: Dagbok, fra: string, til: string, opplosning: Opplosning): Bolk[] {
  const klipp = (b: Bolk): Bolk => ({ periode: b.periode, fra: b.fra < fra ? fra : b.fra, til: b.til > til ? til : b.til })
  if (opplosning === 'uke')
    // Hele uker, så en uke aldri vises halv.
    return dagbok.uker
      .filter((u) => u.sondag >= fra && u.mandag <= til)
      .map((u) => ({ periode: u.nokkel, fra: u.mandag, til: u.sondag }))
      .reverse()
  const ut: Bolk[] = []
  if (opplosning === 'sesong') {
    for (let a = sesongStart(fra); a <= sesongStart(til); a++) {
      const s = lagSesong(a)
      ut.push(klipp({ periode: s.navn, fra: s.fra, til: s.til }))
    }
  } else if (opplosning === 'ar') {
    for (let a = +fra.slice(0, 4); a <= +til.slice(0, 4); a++) ut.push(klipp({ periode: String(a), fra: `${a}-01-01`, til: `${a}-12-31` }))
  } else {
    let [a, m] = [+fra.slice(0, 4), +fra.slice(5, 7)]
    for (;;) {
      const k = `${a}-${String(m).padStart(2, '0')}`
      if (k > til.slice(0, 7)) break
      const siste = fraUtc(Date.UTC(a, m, 0))
      ut.push(klipp({ periode: k, fra: `${k}-01`, til: siste }))
      if (++m > 12) [a, m] = [a + 1, 1]
    }
  }
  return ut
}

function sumrad(s: Sum) {
  return {
    okter: s.okter,
    timer: r1(s.minutter / 60),
    km: r1(s.km),
    sone_min: s.sone,
    styrke_min: s.styrke,
    otek_min: s.otek,
  }
}

function perioderad(dagbok: Dagbok, b: Bolk) {
  const okter: Okt[] = []
  const helse: GarminDag[] = []
  let konkurransedager = 0
  let sykedager = 0
  let skadedager = 0
  for (const d of datoer(b.fra, b.til)) {
    okter.push(...(dagbok.okterPerDato.get(d) ?? []))
    const rapport = dagbok.dagerPerDato.get(d)
    if (rapport?.konkurranse) konkurransedager++
    if (rapport?.syk) sykedager++
    if (rapport?.skadet) skadedager++
    const h = dagbok.helsePerDato.get(d)
    if (h) helse.push(h)
  }
  const akt = aktivitetsfordeling(okter).min
  const sovn = snitt(helse.map((h) => h.sovn_min))
  return {
    ...b,
    ...sumrad(summer(okter)),
    loping_min: akt.loping,
    ski_min: akt.ski,
    sykkel_annet_min: akt.sykkel,
    kvalitetsokter: okter.filter(erKvalitet).length,
    konkurransedager,
    sykedager,
    skadedager,
    snitt_hvilepuls: r1n(snitt(helse.map((h) => h.hvilepuls))),
    snitt_hrv_natt: r1n(snitt(helse.map((h) => h.hrv_natt))),
    snitt_sovn_timer: sovn == null ? null : r1(sovn / 60),
    snitt_belastning_akutt: r1n(snitt(helse.map((h) => h.belastning_akutt))),
  }
}

export function perioder(dagbok: Dagbok, a: { fra: string; til: string; opplosning: Opplosning }) {
  sjekkDatoer(a.fra, a.til)
  const b = bolker(dagbok, a.fra, a.til, a.opplosning)
  if (b.length > MAKS_PERIODER)
    throw new Verktoyfeil(`${b.length} perioder er for mange (maks ${MAKS_PERIODER}). Velg grovere oppløsning eller kortere tidsrom.`)
  return { opplosning: a.opplosning, rader: b.map((x) => perioderad(dagbok, x)) }
}

/** Fast oversikt til systemprompten: én rad per sesong. */
export function sesongoversikt(dagbok: Dagbok) {
  return sesonger(dagbok).map((s) => {
    const sum = summer(dagbok.okter.filter((o) => o.dato >= s.fra && o.dato <= s.til))
    return { sesong: s.navn, ...sumrad(sum) }
  })
}

// ── økter ───────────────────────────────────────────────

export type Sortering = 'nyeste' | 'eldste' | 'lengst' | 'lengst_distanse' | 'mest_hardt'
export const MAKS_OKTER = 50
const NOTAT_MAKS = 320

const kort = (s: string | null, n = NOTAT_MAKS) => (s && s.length > n ? `${s.slice(0, n)} …` : s)

function oktrad(o: Okt) {
  return {
    id: o.id,
    dato: o.dato,
    navn: o.navn,
    min: o.varighet_min,
    km: o.distanse_km || undefined,
    sone_min: o.sone_min,
    styrke_min: o.styrke_min || undefined,
    otek_min: o.otek_min || undefined,
    opplevd_belastning: o.opplevd_belastning ?? undefined,
    dagsform: o.dagsform ?? undefined,
  }
}

export function finnOkter(
  dagbok: Dagbok,
  a: { sok?: string; typer?: Filtertype[]; fra?: string; til?: string; min_harde_min?: number; sorter?: Sortering; antall?: number },
) {
  const fra = a.fra ?? '0000-00-00'
  const til = a.til ?? '9999-99-99'
  if (a.fra || a.til) sjekkDatoer(a.fra ?? '2019-11-01', a.til ?? '2099-12-31')
  const treff = lagTreff({ sok: a.sok ?? '', typer: new Set(a.typer ?? []) }, dagbok.dagerPerDato)
  const funnet = dagbok.okter.filter((o) => o.dato >= fra && o.dato <= til && hardeMinutter(o) >= (a.min_harde_min ?? 0) && treff(o))

  const sorter = a.sorter ?? 'nyeste'
  const verdi: Record<Sortering, (o: Okt) => number> = {
    nyeste: (o) => utc(o.dato) + o.rekkefolge,
    eldste: (o) => -(utc(o.dato) + o.rekkefolge),
    lengst: (o) => o.varighet_min,
    lengst_distanse: (o) => o.distanse_km,
    mest_hardt: hardeMinutter,
  }
  const antall = Math.min(Math.max(a.antall ?? 20, 1), MAKS_OKTER)
  const vist = [...funnet].sort((x, y) => verdi[sorter](y) - verdi[sorter](x)).slice(0, antall)
  return {
    antall_treff: funnet.length,
    sum_alle_treff: sumrad(summer(funnet)),
    viser: vist.length,
    okter: vist.map((o) => ({ ...oktrad(o), notat: kort(o.kommentar) ?? undefined })),
  }
}

export const MAKS_RUNDER = 60

/** Uten GPS (mølle, innendørs) er klokkas distanse og fart for upresise, så de utelates. */
function runderad(r: Runde, gps: boolean) {
  if (!gps) return { tid_s: Math.round(r.tid_s), snittpuls: r.puls, makspuls: r.makspuls }
  return {
    tid_s: Math.round(r.tid_s),
    dist_m: r.dist_m,
    snittpuls: r.puls,
    makspuls: r.makspuls,
    // min/km, bare når runden har distanse og fart
    tempo_min_km: r.fart ? Math.round((1000 / r.fart / 60) * 100) / 100 : null,
  }
}

/** `lesRunder` henter rundene fra sporfila; koordinatene i fila brukes aldri. */
export function okt(dagbok: Dagbok, a: { id: string }, lesRunder: (garminId: number) => Runde[] | null = () => null) {
  const o = dagbok.oktPerId.get(a.id)
  if (!o) throw new Verktoyfeil(`Fant ingen økt med id «${a.id}». Bruk finn_okter eller dager for å finne riktig id.`)
  const rapport = dagbok.dagerPerDato.get(o.dato)
  return {
    id: o.id,
    dato: o.dato,
    uke: ukeForDato(o.dato),
    navn: o.navn,
    beskrivelse: o.beskrivelse,
    notat: o.kommentar,
    kommentarer_fra_andre: o.kommentarer_andre.length ? o.kommentarer_andre : undefined,
    varighet_min: o.varighet_min,
    distanse_km: o.distanse_km || undefined,
    sone_min: o.sone_min,
    opplevd_belastning: o.opplevd_belastning,
    dagsform: o.dagsform,
    konkurransedag: rapport?.konkurranse || undefined,
    resultat: (dagbok.konkurransePerOkt.get(o.id) ?? []).map((k) => ({ ...lopsrad(k), strekk: strekkrader(k) })),
    blokker: o.blokker.map((b) => ({
      aktivitet: b.aktivitet,
      min: b.minutter,
      soner: b.kategori === 'bevegelse' ? b.soner : undefined,
      km: b.distanse_km ?? undefined,
    })),
    garmin: (dagbok.garminPerOkt.get(o.id) ?? []).map((g) => {
      const runder = g.har_spor || g.har_kurver ? lesRunder(g.garmin_id) : null
      return {
        start: g.start_lokal,
        type: g.type,
        min: r1(g.varighet_min),
        km: r1(g.distanse_km) || undefined,
        snittpuls: g.snittpuls,
        makspuls: g.makspuls,
        hoydemeter: g.hoydemeter,
        kadens: g.kadens,
        aerob_te: g.aerob_te,
        anaerob_te: g.anaerob_te,
        belastning: g.belastning,
        runder: runder?.slice(0, MAKS_RUNDER).map((r) => runderad(r, g.har_spor)),
      }
    }),
  }
}

// ── dager ───────────────────────────────────────────────

export const MAKS_DAGER = 62

export function dager(dagbok: Dagbok, a: { fra: string; til: string }) {
  sjekkDatoer(a.fra, a.til)
  const liste = [...datoer(a.fra, a.til)]
  if (liste.length > MAKS_DAGER)
    throw new Verktoyfeil(`${liste.length} dager er for mange (maks ${MAKS_DAGER}). Bruk «perioder» for lengre tidsrom.`)
  return liste.map((dato) => {
    const d = dagbok.dagerPerDato.get(dato)
    const h = dagbok.helsePerDato.get(dato)
    const flagg = d ? (['konkurranse', 'syk', 'skadet', 'reise', 'hoyde', 'fridag'] as const).filter((f) => d[f]) : []
    return {
      dato,
      ukedag: UKEDAGER[new Date(utc(dato)).getUTCDay()],
      flagg: flagg.length ? flagg : undefined,
      dagsnotat: d?.notat ?? undefined,
      sykdom: d?.sykdom ?? undefined,
      skade: d?.skade ?? undefined,
      hvilepuls: h?.hvilepuls,
      hrv_natt: h?.hrv_natt,
      hrv_normalomrade: h?.hrv_normal_lav != null ? `${h.hrv_normal_lav}–${h.hrv_normal_hoy}` : undefined,
      sovn_timer: h?.sovn_min == null ? undefined : r1(h.sovn_min / 60),
      sovnscore: h?.sovnscore ?? undefined,
      belastning_akutt: h?.belastning_akutt,
      belastning_kronisk: h?.belastning_kronisk,
      acwr: h?.acwr,
      okter: (dagbok.okterPerDato.get(dato) ?? []).map((o) => ({ ...oktrad(o), notat: kort(o.kommentar, 200) ?? undefined })),
    }
  })
}

// ── ukeskommentarer ─────────────────────────────────────

export const MAKS_UKEKOMMENTARER = 30

export function ukekommentarer(dagbok: Dagbok, a: { fra?: string; til?: string; sok?: string }) {
  const fra = a.fra ?? '0000-00-00'
  const til = a.til ?? '9999-99-99'
  if (a.fra || a.til) sjekkDatoer(a.fra ?? '2019-11-01', a.til ?? '2099-12-31')
  const ord = (a.sok ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const treff = dagbok.uker.filter((u) => {
    if (!u.kommentarer.length || u.sondag < fra || u.mandag > til) return false
    const tekst = u.kommentarer.map((k) => k.tekst).join(' ').toLowerCase()
    return ord.every((w) => tekst.includes(w))
  })
  return {
    antall_treff: treff.length,
    // nyeste først
    uker: treff.slice(0, MAKS_UKEKOMMENTARER).map((u) => ({
      uke: u.nokkel,
      mandag: u.mandag,
      timer: r1(summer(u.okter).minutter / 60),
      kommentarer: u.kommentarer.map((k) => k.tekst),
    })),
  }
}

// ── konkurranser ────────────────────────────────────────

export const MAKS_KONKURRANSER = 60
export const MAKS_STREKK = 60

function lopsrad(k: Konkurranse) {
  return {
    eventor_id: k.eventor_id,
    dato: k.dato,
    uke: ukeForDato(k.dato),
    navn: k.navn,
    type: k.type,
    disiplin: k.disiplin,
    natt: k.natt || undefined,
    klasse: k.klasse,
    status: k.status,
    plass: k.plass,
    antall: k.antall,
    tid_s: k.tid_s,
    vinnertid_s: k.vinnertid_s,
    prosent_bak: k.prosent_bak,
    strekkfart: k.strekkfart,
    bomtid_s: k.bomtid_s,
    strekk_ugyldige: k.strekk_ugyldige || undefined,
    antall_strekk: k.strekk?.length,
    bomstrekk: k.strekk ? k.strekk.filter((s) => s.bom).length : undefined,
    okt_ider: k.okt_ider,
    lenker: k.lenker,
  }
}

function strekkrader(k: Konkurranse) {
  return k.strekk?.slice(0, MAKS_STREKK).map((s) => ({ post: s.post, tid_s: s.tid_s, ref_s: s.ref_s, indeks: s.indeks, bom: s.bom || undefined }))
}

/**
 * Isaks individuelle løp fra Eventor i et tidsrom, eldste først, med oppkjøringen (de 21
 * dagene før). Med `eventor_id` gis også strekktidene. Andre løpere finnes ikke i dataene.
 */
export function konkurranser(
  dagbok: Dagbok,
  a: { fra: string; til: string; type?: Konkurransetype; disiplin?: Disiplin; eventor_id?: number },
) {
  sjekkDatoer(a.fra, a.til)
  const funnet = filtrer(dagbok.konkurranser, a).filter((k) => a.eventor_id == null || k.eventor_id === a.eventor_id)
  const vist = funnet.slice(-MAKS_KONKURRANSER)
  const stafett = dagbok.stafetter
    .filter((s) => s.dato >= a.fra && s.dato <= a.til)
    .slice(-MAKS_KONKURRANSER)
    .map((s) => ({ eventor_id: s.eventor_id, dato: s.dato, navn: s.navn, klasse: s.klasse, etappe: s.etappe, status: s.status, plass: s.plass, okt_ider: s.okt_ider }))
  return {
    antall_treff: funnet.length,
    viser: vist.length,
    lop: vist.map((k) => {
      const o = oppkjoring(dagbok, k.dato)
      return {
        ...lopsrad(k),
        strekk: a.eventor_id != null ? strekkrader(k) : undefined,
        oppkjoring_21d: {
          timer: r1(o.minutter / 60),
          km: r1(o.km),
          harde_min: o.harde_min,
          kvalitetsokter: o.kvalitetsokter,
          andre_lop: o.konkurranser,
          sykedager: o.sykedager || undefined,
          skadedager: o.skadedager || undefined,
          belastning_akutt_snitt: r1n(o.belastning_akutt) ?? undefined,
          belastning_akutt_dagen_for: o.belastning_dagen_for ?? undefined,
          hrv_snitt: r1n(o.hrv) ?? undefined,
          hvilepuls_snitt: r1n(o.hvilepuls) ?? undefined,
        },
      }
    }),
    stafett: a.eventor_id != null || a.type || a.disiplin ? undefined : stafett,
  }
}
