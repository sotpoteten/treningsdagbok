"""
Henter nye Garmin-data fra intervals.icu og legger dem til data/garmin_*.json.

intervals.icu er koblet til Garmin Connect og har et API med personlig nøkkel. Det gir
aktivitetene med originalfila fra klokka, og det som er målt per dag: hvilepuls, HRV,
søvntid og søvnscore. Normalområdet for HRV og belastningen regnes på nettsiden
(web/src/data/helse.ts), likt for alle data.

- Aktiviteter: alle Garmin-aktiviteter som ikke finnes i garmin_aktiviteter.json.
  Sammendraget og sporet lages fra FIT-fila, på samme måte som fra GDPR-eksporten.
- Helse: dager fra og med en uke før siste dato i garmin_helse.json, til og med i går.
  I dag tas ikke med, fordi natta kan være halvferdig. Verdier som finnes fra før,
  overskrives aldri; bare tomme felt fylles.
- Til slutt kobles aktivitetene til dagbokøktene på nytt.

Krever API-nøkkelen i data/raw/intervals.json: {"api_nokkel": "…"} (holdt utenfor git).

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/hent_intervals.py
"""
import base64
import gzip
import json
import sys
import urllib.request
import zipfile
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from konverter_garmin import SPOR, UT, dekod, koble_okter, les_json, rund, skriv_json, spor_fra_fit

ROOT = Path(__file__).resolve().parent.parent
NOKKEL = ROOT / "data/raw/intervals.json"
API = "https://intervals.icu/api/v1"
HELSEFELT = ("hvilepuls", "hrv_natt", "sovn_min", "sovnscore")

# FIT sport/sub_sport → Garmins aktivitetstype, slik den står i GDPR-eksporten.
TYPER = {
    ("running", "generic"): "running",
    ("running", "treadmill"): "treadmill_running",
    ("running", "trail"): "trail_running",
    ("running", "track"): "track_running",
    ("running", "street"): "street_running",
    ("running", "indoor_running"): "indoor_running",
    ("cycling", "generic"): "cycling",
    ("cycling", "indoor_cycling"): "indoor_cycling",
    ("cycling", "virtual_activity"): "virtual_ride",
    ("cycling", "road"): "road_biking",
    ("cycling", "mountain"): "mountain_biking",
    ("training", "strength_training"): "strength_training",
    ("training", "cardio_training"): "indoor_cardio",
    ("fitness_equipment", "elliptical"): "elliptical",
    ("fitness_equipment", "stair_climbing"): "stair_climbing",
    ("cross_country_skiing", "skate_skiing"): "cross_country_skiing_ws",
    ("cross_country_skiing", "generic"): "cross_country_skiing_ws",
    ("walking", "generic"): "walking",
    ("hiking", "generic"): "hiking",
    ("multisport", "generic"): "multi_sport",
}


class Feil(Exception):
    pass


# ── API ─────────────────────────────────────────────────

def nokkel() -> str | None:
    if not NOKKEL.exists():
        return None
    return json.loads(NOKKEL.read_text(encoding="utf-8")).get("api_nokkel", "").strip() or None


def hent(sti: str, **params) -> bytes:
    n = nokkel()
    if not n:
        raise Feil("API-nøkkelen mangler i data/raw/intervals.json")
    url = f"{API}{sti}" + ("?" + "&".join(f"{k}={v}" for k, v in params.items()) if params else "")
    auth = base64.b64encode(f"API_KEY:{n}".encode()).decode()
    # Cloudflare stopper av og til klienter uten nettleserlik User-Agent.
    headers = {"Authorization": f"Basic {auth}", "User-Agent": "Mozilla/5.0 treningsdagbok"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise Feil(f"intervals.icu svarte {e.code} på {sti}") from e


def hent_fit(intervals_id: str) -> bytes:
    data = hent(f"/activity/{intervals_id}/file")
    if data[:2] == b"\x1f\x8b":
        return gzip.decompress(data)
    if data[:2] == b"PK":
        with zipfile.ZipFile(BytesIO(data)) as z:
            return z.read(z.namelist()[0])
    return data


# ── Omforming (rene funksjoner, testet i test_hent_intervals.py) ─────────

def aktivitetstype(sport: str | None, sub: str | None) -> str:
    sport, sub = str(sport or "ukjent"), str(sub or "generic")
    return TYPER.get((sport, sub)) or TYPER.get((sport, "generic")) or (sport if sub == "generic" else f"{sport}_{sub}")


def aktivitet_fra_fit(garmin_id: int, navn: str | None, start_lokal: str, data: bytes) -> tuple[dict, dict | None]:
    """Sammendrag med samme felt som les_aktiviteter() i konverter_garmin.py, og sporet.
    En multisport-fil har én økt per etappe; da summeres tid, distanse og stigning, og
    snittpuls og kadens står tomme, slik Garmin gjør."""
    okter = dekod(data, {"session"}).get("session") or []
    if not okter:
        raise Feil(f"aktivitet {garmin_id} har ingen økt i FIT-fila")
    okt = okter[0]
    _, spor = spor_fra_fit(data)
    typ = "multi_sport" if len(okter) > 1 else aktivitetstype(okt.get("sport"), okt.get("sub_sport"))
    kadens = okt.get("avg_running_cadence") or okt.get("avg_cadence")
    if kadens is not None and typ.endswith("running"):
        kadens = round((kadens + (okt.get("avg_fractional_cadence") or 0)) * 2)  # skritt per minutt, som Garmin
    elif kadens is not None:
        kadens = round(kadens)
    if len(okter) > 1:
        kadens = None
    tid = sum(o.get("total_timer_time") or o.get("total_elapsed_time") or 0 for o in okter)
    sum_felt = lambda k: sum(o.get(k) or 0 for o in okter) if any(o.get(k) is not None for o in okter) else None  # noqa: E731
    last = okt.get("training_load_peak")
    post = {
        "garmin_id": garmin_id,
        "navn": navn,
        "start_lokal": start_lokal[:19],
        "type": typ,
        "varighet_min": rund(tid / 60, 1),
        "distanse_km": rund((sum_felt("total_distance") or 0) / 1000, 2),
        "snittpuls": okt.get("avg_heart_rate") if len(okter) == 1 else None,
        "makspuls": max((o["max_heart_rate"] for o in okter if o.get("max_heart_rate")), default=None),
        "hoydemeter": sum_felt("total_ascent"),
        "kadens": kadens,
        "aerob_te": rund(okt.get("total_training_effect")),
        "anaerob_te": rund(okt.get("total_anaerobic_training_effect")),
        "belastning": round(last) if last else None,
        "har_spor": bool(spor and "lat" in spor["punkter"]),
        "okt_id": None,
    }
    return post, spor


def helse_fra_wellness(w: dict) -> dict:
    """Det som er målt, med samme navn og enheter som garmin_helse.json."""
    ut = {
        "hvilepuls": w.get("restingHR"),
        "hrv_natt": round(w["hrv"]) if w.get("hrv") else None,
        "sovn_min": round(w["sleepSecs"] / 60) if w.get("sleepSecs") else None,
        "sovnscore": round(w["sleepScore"]) if w.get("sleepScore") else None,
    }
    return {k: v for k, v in ut.items() if v}


def flett_helse(gamle: list[dict], nye: dict[str, dict]) -> tuple[list[dict], int]:
    """Legger nye målinger inn uten å overskrive noe som finnes. Gir lista og antall nye felt."""
    per_dato = {d["dato"]: dict(d) for d in gamle}
    lagt_til = 0
    for dato, felt in nye.items():
        dag = per_dato.setdefault(dato, {"dato": dato})
        for k, v in felt.items():
            if dag.get(k) is None:
                dag[k] = v
                lagt_til += 1
    return [d for _, d in sorted(per_dato.items()) if len(d) > 1], lagt_til


# ── Hovedprogram ────────────────────────────────────────

def oppdater() -> str:
    """Henter og skriver. Gir en kort oppsummering til logg og varsel."""
    aktiviteter = les_json(UT / "garmin_aktiviteter.json")
    helse = les_json(UT / "garmin_helse.json")
    i_dag = date.today()

    # Aktiviteter fra dagen før den siste vi har, så ingen faller mellom to kjøringer.
    fra = (date.fromisoformat(aktiviteter[-1]["start_lokal"][:10]) - timedelta(days=1)).isoformat()
    kjente = {a["garmin_id"] for a in aktiviteter}
    liste = json.loads(hent("/athlete/0/activities", oldest=fra, newest=i_dag.isoformat(),
                            fields="id,name,start_date_local,source,external_id"))
    # En multisport-aktivitet blir én aktivitet per etappe hos intervals.icu, med samme
    # Garmin-id og samme fil. Hos oss er den én aktivitet, som hos Garmin.
    per_gid: dict[int, list[dict]] = {}
    for a in liste:
        if a.get("source") == "GARMIN_CONNECT" and a.get("external_id"):
            per_gid.setdefault(int(str(a["external_id"]).split(".")[0]), []).append(a)
    nye = []
    for gid, etapper in sorted(per_gid.items(), key=lambda x: min(a["start_date_local"] for a in x[1])):
        if gid in kjente:
            continue
        forste = min(etapper, key=lambda a: a["start_date_local"])
        post, spor = aktivitet_fra_fit(gid, forste.get("name"), forste["start_date_local"], hent_fit(forste["id"]))
        if spor:
            skriv_json(SPOR / f"{gid}.json", spor, kompakt=True)  # holdt utenfor git
        nye.append(post)
        kjente.add(gid)

    # Helse: en uke tilbake fra siste dato, til og med i går.
    siste = helse[-1]["dato"] if helse else "2019-11-01"
    fra_helse = (date.fromisoformat(siste) - timedelta(days=7)).isoformat()
    i_gar = (i_dag - timedelta(days=1)).isoformat()
    wellness = json.loads(hent("/athlete/0/wellness", oldest=fra_helse, newest=i_gar))
    helse, nye_felt = flett_helse(helse, {w["id"]: helse_fra_wellness(w) for w in wellness if w["id"] <= i_gar})

    aktiviteter = sorted(aktiviteter + nye, key=lambda a: a["start_lokal"])
    if nye:
        koble_okter(aktiviteter)
    skriv_json(UT / "garmin_aktiviteter.json", aktiviteter)
    skriv_json(UT / "garmin_helse.json", helse)
    return (f"Garmin: {len(nye)} nye aktiviteter ({sum(a['har_spor'] for a in nye)} med spor), "
            f"{nye_felt} nye helseverdier, helse til {helse[-1]['dato'] if helse else '–'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        print(oppdater())
    except Feil as e:
        sys.exit(f"Avbrutt: {e}. Filene i data/ er ikke endret.")
