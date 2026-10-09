"""
Henter data fra Garmin Connect til data/raw/garmin/ (holdt utenfor git).

Krever at du har logget inn én gang med scripts/garmin_login.py.

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/hent_garmin.py
    .venv\\Scripts\\python scripts/hent_garmin.py --fra 2025-06-02 --til 2025-06-08
    .venv\\Scripts\\python scripts/hent_garmin.py --bare helse

Lager i data/raw/garmin/:
    aktiviteter.json      – aktivitetslista fra Garmin (slås sammen på tvers av kjøringer)
    fit/<id>.zip          – originalfila (FIT) per aktivitet, med GPS og puls
    fit/mangler.json      – aktiviteter uten originalfil (f.eks. manuelt registrert)
    dager/<dato>.json     – rå helsedata per dag: HRV, søvn, hvilepuls, dagsoppsummering
    logg.txt              – fremdrift

Skriptet kan stoppes og startes igjen; det hopper over det som allerede er hentet.
Avslutningskoder: 0 ferdig, 2 innlogging må fornyes, 3 Garmin blokkerer (429).
"""
import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectNotFoundError,
    GarminConnectTooManyRequestsError,
)

ROOT = Path(__file__).resolve().parent.parent
UT = ROOT / "data" / "raw" / "garmin"
TOKENS = Path("~/.garminconnect").expanduser()

DAGBOK_FRA = "2019-11-01"
HELSE_FRA = "2023-08-01"  # Forerunner 255 fra høsten 2023; eldre klokker målte ikke HRV/søvn
PAUSE = 1.0               # sekunder mellom kall
MAKS_429 = 5              # antall ganger vi venter på 429 før vi gir opp


class Blokkert(Exception):
    pass


def logg(tekst):
    linje = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {tekst}"
    print(linje, flush=True)
    with open(UT / "logg.txt", "a", encoding="utf-8") as f:
        f.write(linje + "\n")


def skriv_json(sti, data):
    tmp = sti.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(sti)


def les_json(sti, standard):
    return json.loads(sti.read_text(encoding="utf-8")) if sti.exists() else standard


def kall(funksjon, *args):
    """Kaller Garmin med pause, og venter stadig lenger hvis Garmin svarer 429."""
    for forsok in range(MAKS_429 + 1):
        time.sleep(PAUSE)
        try:
            return funksjon(*args)
        except GarminConnectTooManyRequestsError:
            if forsok == MAKS_429:
                raise Blokkert()
            vent = 60 * 2 ** forsok
            logg(f"429 fra Garmin, venter {vent} s")
            time.sleep(vent)


def dager(fra, til):
    d = date.fromisoformat(fra)
    slutt = date.fromisoformat(til)
    while d <= slutt:
        yield d.isoformat()
        d += timedelta(days=1)


def hent_aktiviteter(api, fra, til):
    sti = UT / "aktiviteter.json"
    alle = {a["activityId"]: a for a in les_json(sti, [])}
    nye = kall(api.get_activities_by_date, fra, til, None, "asc")
    for a in nye:
        alle[a["activityId"]] = a
    skriv_json(sti, sorted(alle.values(), key=lambda a: a.get("startTimeLocal", "")))
    logg(f"Aktivitetsliste: {len(nye)} i perioden {fra}–{til}, {len(alle)} totalt")


def hent_fit(api, fra, til):
    mappe = UT / "fit"
    mappe.mkdir(exist_ok=True)
    mangler_sti = mappe / "mangler.json"
    mangler = set(les_json(mangler_sti, []))
    aktiviteter = [
        a for a in les_json(UT / "aktiviteter.json", [])
        if fra <= a.get("startTimeLocal", "")[:10] <= til
    ]
    gjenstar = [
        a for a in aktiviteter
        if not (mappe / f"{a['activityId']}.zip").exists() and a["activityId"] not in mangler
    ]
    logg(f"FIT: {len(aktiviteter)} aktiviteter i perioden, {len(gjenstar)} gjenstår")
    for i, a in enumerate(gjenstar, 1):
        aid = a["activityId"]
        try:
            data = kall(api.download_activity, aid, Garmin.ActivityDownloadFormat.ORIGINAL)
        except GarminConnectNotFoundError:
            mangler.add(aid)
            skriv_json(mangler_sti, sorted(mangler))
            continue
        except GarminConnectConnectionError as e:
            logg(f"FIT {aid}: feil, prøver igjen ved neste kjøring ({e})")
            continue
        if not data:
            mangler.add(aid)
            skriv_json(mangler_sti, sorted(mangler))
            continue
        tmp = mappe / f"{aid}.tmp"
        tmp.write_bytes(data)
        tmp.replace(mappe / f"{aid}.zip")
        if i % 50 == 0 or i == len(gjenstar):
            logg(f"FIT: {i}/{len(gjenstar)} ({a.get('startTimeLocal', '')[:10]})")


def hent_helse(api, fra, til):
    mappe = UT / "dager"
    mappe.mkdir(exist_ok=True)
    fra = max(fra, HELSE_FRA)
    gjenstar = [d for d in dager(fra, til) if not (mappe / f"{d}.json").exists()]
    logg(f"Helse: {len(gjenstar)} dager gjenstår ({fra}–{til})")
    kilder = {
        "hrv": api.get_hrv_data,
        "sovn": api.get_sleep_data,
        "hvilepuls": api.get_rhr_day,
        "dagsoppsummering": api.get_user_summary,
    }
    for i, d in enumerate(gjenstar, 1):
        post = {"dato": d}
        try:
            for navn, funksjon in kilder.items():
                try:
                    post[navn] = kall(funksjon, d)
                except GarminConnectNotFoundError:
                    post[navn] = None
        except GarminConnectConnectionError as e:
            logg(f"Helse {d}: feil, prøver igjen ved neste kjøring ({e})")
            continue
        skriv_json(mappe / f"{d}.json", post)
        if i % 25 == 0 or i == len(gjenstar):
            logg(f"Helse: {i}/{len(gjenstar)} ({d})")


def main():
    p = argparse.ArgumentParser(description="Henter Garmin-data til data/raw/garmin/")
    p.add_argument("--fra", default=DAGBOK_FRA)
    p.add_argument("--til", default=date.today().isoformat())
    p.add_argument("--bare", choices=["aktiviteter", "fit", "helse"])
    args = p.parse_args()

    UT.mkdir(parents=True, exist_ok=True)
    api = Garmin()
    try:
        api.login(str(TOKENS))
    except (GarminConnectAuthenticationError, GarminConnectConnectionError) as e:
        logg(f"Innloggingen virker ikke ({e}). Kjør scripts/garmin_login.py på nytt.")
        sys.exit(2)
    logg(f"Start: {args.fra}–{args.til}, del: {args.bare or 'alt'}")

    try:
        if args.bare in (None, "aktiviteter"):
            hent_aktiviteter(api, args.fra, args.til)
        if args.bare in (None, "fit"):
            hent_fit(api, args.fra, args.til)
        if args.bare in (None, "helse"):
            hent_helse(api, args.fra, args.til)
    except Blokkert:
        logg("Garmin blokkerer fortsatt (429). Stopper; kjør igjen senere.")
        sys.exit(3)
    except GarminConnectAuthenticationError as e:
        logg(f"Innloggingen gikk ut underveis ({e}). Kjør scripts/garmin_login.py på nytt.")
        sys.exit(2)
    logg("Ferdig")


if __name__ == "__main__":
    main()
