"""
Konverterer Garmin-eksporten (GDPR-eksport fra Garmin Connect) til filer for nettsiden.

Leser fra data/raw/garmin/  (kopi av DI_CONNECT/ fra eksporten, holdt utenfor git):
    DI-Connect-Fitness/*_summarizedActivities.json   – aktivitetssammendrag
    DI-Connect-Uploaded-Files/UploadedFiles_*.zip    – FIT-filer (aktiviteter, HRV m.m.)
    DI-Connect-Aggregator/UDSFile_*.json             – daglig sammendrag (hvilepuls)
    DI-Connect-Wellness/*_sleepData.json             – søvn
    DI-Connect-Wellness/*_healthStatusData.json      – HRV med baseline (fra sept. 2025)
    DI-Connect-Metrics/MetricsAcuteTrainingLoad_*    – akutt/kronisk belastning (fra 2023)

Lager:
    data/garmin_aktiviteter.json   – én post per aktivitet fra 1.11.2019, med okt_id (uten koordinater)
    data/garmin_helse.json         – én post per dag: hvilepuls, HRV, søvn, belastning
    data/garmin_spor/<id>.json     – GPS-spor, puls, fart og runder per aktivitet (holdt utenfor git)
    data/raw/garmin/fit_indeks.json – buffer, så FIT-filene bare dekodes én gang

Bruk (fra prosjektmappen, krever .venv med fitdecode og tzdata):
    .venv\\Scripts\\python scripts/konverter_garmin.py

Første kjøring dekoder rundt 5 000 aktivitetsfiler og tar en stund. Senere kjøringer
bruker bufferen og går raskt.
"""
import argparse
import io
import json
import os
import sys
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import fitdecode

sys.path.insert(0, str(Path(__file__).resolve().parent))
from garmin_kobling import koble  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "garmin"
UT = ROOT / "data"
SPOR = UT / "garmin_spor"
INDEKS = RAW / "fit_indeks.json"
OSLO = ZoneInfo("Europe/Oslo")
FRA = "2019-11-01"
SEMI = 180 / 2**31  # semicircles → grader
SPOR_INTERVALL_S = 5

LOPETYPER = {"running", "treadmill_running", "trail_running", "indoor_running", "track_running", "street_running"}


def advarsel(tekst):
    print(f"  ADVARSEL: {tekst}")


def les_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def skriv_json(p, data, kompakt=False):
    p.parent.mkdir(parents=True, exist_ok=True)
    tekst = json.dumps(data, ensure_ascii=False, separators=(",", ":") if kompakt else None, indent=None if kompakt else 1)
    p.write_text(tekst, encoding="utf-8")


def rund(v, n=1):
    return None if v is None else round(v, n)


# ── Aktiviteter ─────────────────────────────────────────


def les_aktiviteter():
    rader = []
    for p in sorted(RAW.glob("DI-Connect-Fitness/*_summarizedActivities.json")):
        rader += les_json(p)[0]["summarizedActivitiesExport"]
    ut = []
    for a in rader:
        # startTimeLocal er lokal tid uttrykt som «UTC» i millisekunder
        lokal = datetime.fromtimestamp(a["startTimeLocal"] / 1000, tz=timezone.utc).replace(tzinfo=None)
        if lokal.date().isoformat() < FRA or not a.get("duration"):
            continue
        typ = a.get("activityType") or "ukjent"
        ut.append(
            {
                "garmin_id": a["activityId"],
                "navn": a.get("name"),
                "start_lokal": lokal.isoformat(timespec="seconds"),
                "start_gmt_ms": int(a["startTimeGmt"]),
                "type": typ,
                "varighet_min": rund(a["duration"] / 60000, 1),
                "distanse_km": rund((a.get("distance") or 0) / 100000, 2),
                "snittpuls": a.get("avgHr") and round(a["avgHr"]),
                "makspuls": a.get("maxHr") and round(a["maxHr"]),
                "hoydemeter": a.get("elevationGain") and round(a["elevationGain"] / 100),
                "kadens": a.get("avgDoubleCadence") and round(a["avgDoubleCadence"]),
                "aerob_te": rund(a.get("aerobicTrainingEffect")),
                "anaerob_te": rund(a.get("anaerobicTrainingEffect")),
                "belastning": a.get("activityTrainingLoad") and round(a["activityTrainingLoad"]),
                "har_spor": False,
                "okt_id": None,
            }
        )
    ut.sort(key=lambda a: a["start_lokal"])
    return ut


# ── FIT-filer ───────────────────────────────────────────


def fit_type(data):
    """file_id.type og time_created uten å dekode resten av fila."""
    with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.DISABLED) as fr:
        for f in fr:
            if isinstance(f, fitdecode.FitDataMessage) and f.name == "file_id":
                t = f.get_value("time_created", fallback=None)
                return str(f.get_value("type", fallback=None)), t.isoformat() if t else None
    return None, None


def dekod(data, navn):
    ut = defaultdict(list)
    with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.DISABLED) as fr:
        for f in fr:
            if isinstance(f, fitdecode.FitDataMessage) and f.name in navn:
                ut[f.name].append({fl.name: fl.value for fl in f.fields if not fl.name.startswith("unknown")})
    return ut


def hrv_fra_fit(data):
    m = dekod(data, {"hrv_status_summary"})
    s = m.get("hrv_status_summary")
    if not s:
        return None
    s = s[-1]
    t = s.get("timestamp")
    if not t:
        return None
    return {
        "dato": t.astimezone(OSLO).date().isoformat(),
        "hrv_natt": s.get("last_night_average"),
        "hrv_ukesnitt": s.get("weekly_average"),
        "hrv_baseline_lav": s.get("baseline_balanced_lower"),
        "hrv_baseline_hoy": s.get("baseline_balanced_upper"),
        "hrv_status": s.get("status"),
    }


def spor_fra_fit(data):
    """Tynnet spor (kolonnevis) og runder fra en aktivitetsfil, eller None."""
    m = dekod(data, {"record", "lap", "session"})
    rec = m.get("record") or []
    okter = m.get("session") or []
    if not okter:
        return None, None
    start = okter[0].get("start_time")
    if not start:
        return None, None
    kol = {k: [] for k in ("t", "lat", "lon", "puls", "fart", "hoyde", "dist")}
    siste = None
    for r in rec:
        ts = r.get("timestamp")
        if not ts:
            continue
        t = (ts - start).total_seconds()
        if siste is not None and t - siste < SPOR_INTERVALL_S:
            continue
        siste = t
        lat, lon = r.get("position_lat"), r.get("position_long")
        fart = r.get("enhanced_speed", r.get("speed"))
        hoyde = r.get("enhanced_altitude", r.get("altitude"))
        kol["t"].append(int(t))
        kol["lat"].append(round(lat * SEMI, 5) if lat is not None else None)
        kol["lon"].append(round(lon * SEMI, 5) if lon is not None else None)
        kol["puls"].append(r.get("heart_rate"))
        kol["fart"].append(rund(fart, 2))
        kol["hoyde"].append(rund(hoyde, 1))
        kol["dist"].append(round(r["distance"]) if r.get("distance") is not None else None)
    # Fjern kolonner som er helt tomme
    kol = {k: v for k, v in kol.items() if any(x is not None for x in v)}
    runder = []
    for lap in m.get("lap") or []:
        ls = lap.get("start_time")
        tid = lap.get("total_timer_time")
        if not ls or not tid:
            continue
        dist = lap.get("total_distance")
        runder.append(
            {
                "start_s": int((ls - start).total_seconds()),
                "tid_s": round(tid, 1),
                "dist_m": round(dist) if dist else None,
                "puls": lap.get("avg_heart_rate"),
                "makspuls": lap.get("max_heart_rate"),
                "fart": rund(lap.get("enhanced_avg_speed", lap.get("avg_speed")), 2),
            }
        )
    return start, {"punkter": kol, "runder": runder}


# Arbeidsprosesser for parallell dekoding (hver prosess åpner arkivene selv).
_ARKIV = {}
_PER_START = {}


def _arbeider_start(per_start):
    global _PER_START
    _PER_START = per_start


def _dekod_oppgave(oppgave):
    """Kjøres i en arbeidsprosess. Gir (filnavn, felt som skal inn i indeksen)."""
    zp, navn, typ = oppgave
    z = _ARKIV.get(zp) or _ARKIV.setdefault(zp, zipfile.ZipFile(zp))
    try:
        data = z.read(navn)
        if typ == "68":
            return navn, {"hrv": hrv_fra_fit(data)}
        start, spor = spor_fra_fit(data)
    except Exception as e:
        return navn, {"garmin_id": None, "feil": f"{e.__class__.__name__}: {e}"}
    gid = None
    if start:
        s = int(start.timestamp())
        gid = next((_PER_START[s + d] for d in (0, -1, 1, -2, 2) if s + d in _PER_START), None)
    if gid and spor:
        skriv_json(SPOR / f"{gid}.json", spor, kompakt=True)
    return navn, {"garmin_id": gid}


def gaa_gjennom_fit(aktiviteter):
    """
    Fase 1: finn filtypen til alle FIT-filer (rask, bufres i fit_indeks.json).
    Fase 2: dekod aktivitetsfiler (spor) og HRV-filer parallelt.
    Gir HRV per dato.
    """
    indeks = les_json(INDEKS) if INDEKS.exists() else {}
    grense = FRA[:4] + "-10-25"  # litt slakk før 1.11., siden time_created er i UTC
    zips = sorted(RAW.glob("DI-Connect-Uploaded-Files/UploadedFiles_*.zip"))

    plassering = {}
    for zi, zp in enumerate(zips, 1):
        nye = 0
        with zipfile.ZipFile(zp) as z:
            for i in z.infolist():
                if not i.filename.lower().endswith(".fit"):
                    continue
                plassering[i.filename] = str(zp)
                if i.filename in indeks:
                    continue
                try:
                    typ, tid = fit_type(z.read(i))
                except Exception:
                    typ, tid = "feil", None
                indeks[i.filename] = {"type": typ, "tid": tid}
                nye += 1
        print(f"  Fase 1: {zi}/{len(zips)} arkiv ({nye} nye filer)", flush=True)
    skriv_json(INDEKS, indeks, kompakt=True)

    oppgaver = []
    for navn, post in indeks.items():
        typ = post["type"]
        if typ == "68" and "hrv" not in post:
            oppgaver.append((plassering[navn], navn, typ))
        elif typ == "activity" and (post.get("tid") or "") >= grense:
            gid = post.get("garmin_id")
            if "garmin_id" not in post or (gid and not (SPOR / f"{gid}.json").exists()):
                oppgaver.append((plassering[navn], navn, typ))

    if oppgaver:
        print(f"  Fase 2: dekoder {len(oppgaver)} filer på {os.cpu_count()} kjerner …", flush=True)
        per_start = {a["start_gmt_ms"] // 1000: a["garmin_id"] for a in aktiviteter}
        ferdig = 0
        with ProcessPoolExecutor(initializer=_arbeider_start, initargs=(per_start,)) as pool:
            for navn, felt in pool.map(_dekod_oppgave, oppgaver, chunksize=8):
                if felt.get("feil"):
                    advarsel(f"klarte ikke å lese {navn}: {felt.pop('feil')}")
                indeks[navn].update(felt)
                ferdig += 1
                if ferdig % 250 == 0 or ferdig == len(oppgaver):
                    print(f"  Fase 2: {ferdig}/{len(oppgaver)}", flush=True)
                    skriv_json(INDEKS, indeks, kompakt=True)  # lagre underveis, så avbrudd ikke koster alt

    hrv = {}
    for post in indeks.values():
        if post.get("hrv"):
            hrv[post["hrv"]["dato"]] = post["hrv"]

    for a in aktiviteter:
        f = SPOR / f"{a['garmin_id']}.json"
        a["har_spor"] = f.exists() and '"lat":' in f.read_text(encoding="utf-8")
    typer = Counter(p["type"] for p in indeks.values())
    print("  FIT-filer etter type:", dict(typer.most_common(8)))
    return hrv


# ── Helse ───────────────────────────────────────────────


def les_helse(hrv_fit):
    dager = defaultdict(dict)

    for p in RAW.glob("DI-Connect-Aggregator/UDSFile_*.json"):
        for r in les_json(p):
            d = r.get("calendarDate")
            if d and d >= FRA and r.get("restingHeartRate"):
                dager[d]["hvilepuls"] = r["restingHeartRate"]

    for p in RAW.glob("DI-Connect-Wellness/*_sleepData.json"):
        for r in les_json(p):
            d = r.get("calendarDate")
            if not d or d < FRA:
                continue
            dyp, lett, rem = (r.get(k) or 0 for k in ("deepSleepSeconds", "lightSleepSeconds", "remSleepSeconds"))
            if dyp + lett + rem <= 0:
                continue  # natt uten måling
            start = r.get("sleepStartTimestampGMT")
            slutt = r.get("sleepEndTimestampGMT")

            def lokal(s):
                return datetime.fromisoformat(s).replace(tzinfo=timezone.utc).astimezone(OSLO).strftime("%H:%M") if s else None

            dager[d].update(
                {
                    "sovn_start": lokal(start),
                    "sovn_slutt": lokal(slutt),
                    "sovn_min": round((dyp + lett + rem) / 60),
                    "dyp_min": round(dyp / 60),
                    "lett_min": round(lett / 60),
                    "rem_min": round(rem / 60) if r.get("remSleepSeconds") is not None else None,
                    "vaken_min": round((r.get("awakeSleepSeconds") or 0) / 60),
                    "sovnscore": (r.get("sleepScores") or {}).get("overallScore"),
                    "respirasjon": rund(r.get("averageRespiration")),
                }
            )

    # HRV: FIT-filene først, så helsestatus (fra sept. 2025) for dager som mangler
    for d, h in hrv_fit.items():
        if d >= FRA and h.get("hrv_natt"):
            dager[d].update({k: v for k, v in h.items() if k != "dato"})
    for p in RAW.glob("DI-Connect-Wellness/*_healthStatusData.json"):
        for r in les_json(p):
            d = r.get("calendarDate")
            if not d or "hrv_natt" in dager.get(d, {}):
                continue
            for m in r.get("metrics") or []:
                if m.get("type") == "HRV" and m.get("value"):
                    dager[d].update(
                        {
                            "hrv_natt": m["value"],
                            "hrv_baseline_lav": m.get("baselineLowerLimit"),
                            "hrv_baseline_hoy": m.get("baselineUpperLimit"),
                            "hrv_status": (m.get("status") or "").lower() or None,
                        }
                    )

    for p in RAW.glob("DI-Connect-Metrics/MetricsAcuteTrainingLoad_*.json"):
        for r in les_json(p):
            d = datetime.fromtimestamp(r["calendarDate"] / 1000, tz=timezone.utc).date().isoformat()
            if d < FRA:
                continue
            dager[d].update(
                {
                    "belastning_akutt": r.get("dailyTrainingLoadAcute"),
                    "belastning_kronisk": r.get("dailyTrainingLoadChronic"),
                    "acwr": rund(r.get("dailyAcuteChronicWorkloadRatio"), 2),
                }
            )

    return [{"dato": d, **v} for d, v in sorted(dager.items())]


# ── Kobling ─────────────────────────────────────────────


def koble_okter(aktiviteter):
    okter = [o for o in les_json(UT / "okter.json") if o["dato"] >= FRA]
    akt = [
        {
            "garmin_id": a["garmin_id"],
            "dato": a["start_lokal"][:10],
            "start": a["start_lokal"],
            "varighet_min": a["varighet_min"],
            "distanse_km": a["distanse_km"],
            "loping": a["type"] in LOPETYPER,
        }
        for a in aktiviteter
    ]
    par = koble(okter, akt)
    for a in aktiviteter:
        a["okt_id"] = par.get(a["garmin_id"])

    koblede = set(par.values())
    print(f"\nKobling: {len(koblede)} av {len(okter)} økter har Garmin-data ({len(koblede) / len(okter):.0%}), "
          f"{len(par)} av {len(aktiviteter)} aktiviteter er koblet.")
    per_ar = defaultdict(lambda: [0, 0])
    for o in okter:
        per_ar[o["dato"][:4]][1] += 1
        if o["id"] in koblede:
            per_ar[o["dato"][:4]][0] += 1
    print("  Per år:", ", ".join(f"{ar}: {k / n:.0%}" for ar, (k, n) in sorted(per_ar.items())))
    uten = [o for o in okter if o["id"] not in koblede]
    navn = Counter(o["navn"] for o in uten)
    print("  Vanligste økter uten Garmin:", ", ".join(f"{n} ({c})" for n, c in navn.most_common(8)))
    ukoblet = Counter(a["type"] for a in aktiviteter if not a["okt_id"])
    print("  Garmin-aktiviteter uten økt, etter type:", dict(ukoblet.most_common(6)))


# ── Hovedprogram ────────────────────────────────────────


def main():
    argparse.ArgumentParser(description="Konverterer Garmin-eksporten i data/raw/garmin/").parse_args()

    if not (RAW / "DI-Connect-Fitness").exists():
        sys.exit("Fant ikke data/raw/garmin/DI-Connect-Fitness. Kopier DI_CONNECT/ fra eksporten til data/raw/garmin/.")

    print("Leser aktiviteter …")
    aktiviteter = les_aktiviteter()
    print(f"  {len(aktiviteter)} aktiviteter fra {FRA}")

    print("Går gjennom FIT-filer (første gang tar det lang tid) …")
    hrv = gaa_gjennom_fit(aktiviteter)

    print("Leser helsedata …")
    helse = les_helse(hrv)

    koble_okter(aktiviteter)

    for a in aktiviteter:
        del a["start_gmt_ms"]
    skriv_json(UT / "garmin_aktiviteter.json", aktiviteter)
    skriv_json(UT / "garmin_helse.json", helse)

    def antall(felt):
        return sum(1 for d in helse if d.get(felt) is not None)

    print("\nSkrev:")
    print(f"  garmin_aktiviteter.json: {len(aktiviteter)} aktiviteter, {sum(a['har_spor'] for a in aktiviteter)} med GPS-spor")
    print(f"  garmin_helse.json: {len(helse)} dager – hvilepuls {antall('hvilepuls')}, HRV {antall('hrv_natt')}, "
          f"søvn {antall('sovn_min')}, søvnscore {antall('sovnscore')}, belastning {antall('belastning_akutt')}")
    print(f"  garmin_spor/: {len(list(SPOR.glob('*.json')))} filer")


if __name__ == "__main__":
    main()
