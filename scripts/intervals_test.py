"""
Sjekker hva intervals.icu gir av Garmin-data, før vi bygger en ukentlig henting.

Skriptet bare leser. Det skriver ut feltnavn, antall og avvik mot dataene vi har fra
Garmins GDPR-eksport, aldri notater eller koordinater.

Krever API-nøkkelen i data/raw/intervals.json: {"api_nokkel": "…"} (Settings →
Developer Settings på intervals.icu). Fila holdes utenfor git.

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/intervals_test.py
"""
import base64
import gzip
import json
import sys
import urllib.request
import zipfile
from collections import Counter
from datetime import date
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from konverter_garmin import SPOR, UT, les_json, spor_fra_fit  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NOKKEL = ROOT / "data/raw/intervals.json"
API = "https://intervals.icu/api/v1"
FRA = "2019-11-01"


def hent(sti: str, **params) -> bytes:
    nokkel = json.loads(NOKKEL.read_text(encoding="utf-8"))["api_nokkel"].strip()
    if not nokkel:
        sys.exit("Lim API-nøkkelen inn i data/raw/intervals.json først.")
    url = f"{API}{sti}" + ("?" + "&".join(f"{k}={v}" for k, v in params.items()) if params else "")
    auth = base64.b64encode(f"API_KEY:{nokkel}".encode()).decode()
    # Cloudflare stopper av og til klienter uten nettleserlik User-Agent.
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}", "User-Agent": "Mozilla/5.0 treningsdagbok"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def hent_json(sti: str, **params):
    return json.loads(hent(sti, **params))


def helse() -> None:
    print("── Helse (wellness) ──")
    alle = hent_json("/athlete/0/wellness", oldest=FRA, newest=date.today().isoformat())
    if not alle:
        print("Ingen helsedata ennå. Er Garmin koblet til, og er helsedeling godtatt?")
        return
    print(f"{len(alle)} dager, fra {alle[0]['id']} til {alle[-1]['id']}")
    felt = Counter(k for d in alle for k, v in d.items() if v not in (None, 0, "") and k != "id")
    print("Felt med verdier:", ", ".join(f"{k} {n}" for k, n in felt.most_common()))

    vi_har = {d["dato"]: d for d in les_json(UT / "garmin_helse.json")}
    par = [("hvilepuls", "restingHR", 1), ("hrv_natt", "hrv", 1), ("sovn_min", "sleepSecs", 1 / 60),
           ("sovnscore", "sleepScore", 1), ("respirasjon", "respiration", 1)]
    print("Mot GDPR-eksporten, dager der begge har verdi:")
    for vart, deres, faktor in par:
        avvik = [abs(vi_har[d["id"]][vart] - d[deres] * faktor) for d in alle
                 if d["id"] in vi_har and vi_har[d["id"]].get(vart) is not None and d.get(deres) is not None]
        if avvik:
            like = sum(a < 1 for a in avvik)
            print(f"  {vart:12} ← {deres:12} {len(avvik):4} dager, {like} like (avvik < 1), snittavvik {sum(avvik) / len(avvik):.1f}")
        else:
            print(f"  {vart:12} ← {deres:12} ingen felles dager")


def aktiviteter() -> None:
    print("\n── Aktiviteter ──")
    alle = hent_json("/athlete/0/activities", oldest=FRA, newest=date.today().isoformat(),
                     fields="id,start_date_local,source,external_id,type,file_type,stream_types")
    if not alle:
        print("Ingen aktiviteter ennå.")
        return
    alle.sort(key=lambda a: a["start_date_local"])
    print(f"{len(alle)} aktiviteter, fra {alle[0]['start_date_local'][:10]} til {alle[-1]['start_date_local'][:10]}")
    print("Kilde:", dict(Counter(a.get("source") for a in alle)))
    print("Filtype:", dict(Counter(a.get("file_type") for a in alle)))
    vi_har = {str(a["garmin_id"]) for a in les_json(UT / "garmin_aktiviteter.json")}
    med_id = [a for a in alle if a.get("external_id")]
    treff = [a for a in med_id if str(a["external_id"]).split(".")[0] in vi_har]
    print(f"external_id: {len(med_id)} har, {len(treff)} er Garmin-id-er vi allerede har")

    # Én aktivitet vi har sporfil for: last ned originalfila og sammenlign sporet.
    for a in reversed(treff):
        gid = str(a["external_id"]).split(".")[0]
        if (SPOR / f"{gid}.json").exists():
            sammenlign_fil(a["id"], gid)
            break
    else:
        print("Fant ingen aktivitet som finnes både her og i garmin_spor/, så fila er ikke sammenlignet.")


def sammenlign_fil(intervals_id: str, gid: str) -> None:
    data = hent(f"/activity/{intervals_id}/file")
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    elif data[:2] == b"PK":
        with zipfile.ZipFile(BytesIO(data)) as z:
            data = z.read(z.namelist()[0])
    _, nytt = spor_fra_fit(data)
    gammelt = les_json(SPOR / f"{gid}.json")
    if not nytt:
        print(f"Originalfila for {gid} kunne ikke leses som FIT ({len(data)} byte).")
        return
    print(f"Originalfil for Garmin-aktivitet {gid}:")
    for k in sorted(set(nytt["punkter"]) | set(gammelt["punkter"])):
        print(f"  {k:6} punkter: intervals {len(nytt['punkter'].get(k, []))}, GDPR {len(gammelt['punkter'].get(k, []))}")
    print(f"  runder: intervals {len(nytt['runder'])}, GDPR {len(gammelt['runder'])}, "
          f"like: {nytt['runder'] == gammelt['runder']}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        helse()
        aktiviteter()
    except urllib.error.HTTPError as e:
        sys.exit(f"intervals.icu svarte {e.code}. Sjekk nøkkelen i data/raw/intervals.json.")
