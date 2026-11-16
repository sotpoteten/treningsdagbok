"""
Konverterer rå eksport fra dagbok.olympiatoppen.no (workoutSessions.json)
til ryddige filer for nettsiden og analyse.

Leser fra data/raw/:
    workoutSessions.json  – treningsøktene (påkrevd)
    userData.json         – profil, pulssoner og dagsrapporter (valgfri)
    weekComments.json     – ukeskommentarer (valgfri)

Bruk (fra prosjektmappen):
    python scripts/konverter.py
    python scripts/konverter.py --fra 2019-11-01

Lager i data/:
    okter.json   – én post per økt, med blokker nøstet inn (for nettsiden)
    blokker.csv  – én rad per måling i hver blokk (flat tabell for analyse)
    dager.json   – dagsrapporter (syk, skadet, reise, høyde, fridag, konkurranse, notat)
    uker.json    – ukeskommentarer per ISO-uke
    profil.json  – navn, idrett, klubb og pulssoner (uten e-post/fødselsdato)

Krever bare Python 3 (ingen eksterne pakker). Se CLAUDE.md for datamodellen.
"""
import argparse
import csv
import json
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ActivityId -> (navn, kategori)
AKTIVITETER = {
    1: ("Løping terreng", "bevegelse"),
    2: ("Løping sti/vei", "bevegelse"),
    3: ("Løping mølle", "bevegelse"),
    4: ("Ski klassisk", "bevegelse"),
    5: ("Ski skøyting", "bevegelse"),
    6: ("Rulleski", "bevegelse"),
    7: ("Sykling", "bevegelse"),
    8: ("Annet", "bevegelse"),
    9: ("O-teknikk nordisk", "o-teknikk"),
    10: ("O-teknikk kontinentalt", "o-teknikk"),
    11: ("O-teknikk sprint", "o-teknikk"),
    12: ("Generell styrke", "styrke"),
    13: ("Spesifikk styrke", "styrke"),
    14: ("Maksimal styrke", "styrke"),
    15: ("Spenst", "styrke"),
    16: ("Annen styrketrening", "styrke"),
    17: ("Bevegelighet/tøying", "bevegelighet"),
}
LOPING = {1, 2, 3}

# Flagg i dagsrapportene (userData.json -> HealthStatuses). Øvrige felt
# (hvilepuls, HRV, søvn, beredskap, smerte, menstruasjon) er aldri brukt og tas ikke med.
DAGFLAGG = {
    "IsSick": "syk",
    "IsInjured": "skadet",
    "IsTraveling": "reise",
    "IsAltitudeDay": "hoyde",
    "IsDayOff": "fridag",
    "IsCompetitionDay": "konkurranse",
}

# ActivityMetricId: 1–8 = minutter i sone I1–I8, 9 = distanse (km, kun løping),
# 11 = minutter o-teknikk, 12 = minutter styrke/bevegelighet
SONER = {i: f"I{i}" for i in range(1, 9)}
METRIKK_DISTANSE = 9
METRIKK_OTEK = 11
METRIKK_STYRKE = 12

# Feil i OLT: ukeskommentarene fra 2020 uke 53 til 2022 uke 51 er lagret én uke for tidlig.
# De er skrevet ca. 13 dager etter mandagen i uka de står på, mot 6–8 dager ellers, og
# 2022 uke 52 står uten kommentar. Bekreftet av Isak 2026-11-16. Rådataene står urørt.
FORSKJOVET_UKE = ((2020, 53), (2022, 51))


# Enkeltkommentarer OLT har lagret på feil uke, med uka de hører til (bekreftet av Isak
# 2026-11-16). Nøkkelen er kommentarens Id i weekComments.json.
FLYTTET_KOMMENTAR = {
    "a48e62dd-3896-4080-9cd8-36430b178c01": (2025, 1),  # «Bug i OLT …», lå på 2024 uke 1
    "b3c16d9d-3bea-f011-8196-002248dcd8ce": (2026, 1),  # skrevet 5.1.2026, lå på 2025 uke 1
}

# Tekst som fjernes fra starten av en kommentar fordi den bare handlet om OLT-feilen
# (Isak 2026-11-16). Fjernes bare hvis teksten fortsatt begynner slik.
FJERNET_START = {
    "a48e62dd-3896-4080-9cd8-36430b178c01": "Bug i OLT, ukeskommentaren over fra i fjor. ",
}


def rett_uke(ar: int, uke: int) -> tuple[int, int]:
    """ISO-uka kommentaren egentlig hører til (flyttet én uke fram innenfor FORSKJOVET_UKE)."""
    if FORSKJOVET_UKE[0] <= (ar, uke) <= FORSKJOVET_UKE[1]:
        ar, uke, _ = (date.fromisocalendar(ar, uke, 1) + timedelta(days=7)).isocalendar()
    return ar, uke


def les(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def konverter(raw_dir: Path, fra: str, ut: Path = ROOT / "data"):
    """Skriver filene til `ut` (standard data/). Testene gir en midlertidig mappe."""
    okter_raw = les(raw_dir / "workoutSessions.json")
    bruker = les(raw_dir / "userData.json")
    uker_raw = les(raw_dir / "weekComments.json")
    meg = bruker["Id"] if bruker else None
    okter_raw = [s for s in okter_raw if s["Date"] >= fra]
    okter_raw.sort(key=lambda s: (s["Date"], s["Order"]))

    okter, rader, advarsler = [], [], Counter()

    for s in okter_raw:
        blokker = []
        sone_min = Counter()
        km = 0.0
        otek_min = styrke_min = 0

        for a in sorted(s["ReportedSessionActivities"], key=lambda a: a["Position"]):
            aid = a["ActivityId"]
            navn, kategori = AKTIVITETER.get(aid, (f"Ukjent ({aid})", "ukjent"))
            if aid not in AKTIVITETER:
                advarsler[f"ukjent ActivityId {aid}"] += 1
            blokk = {"posisjon": a["Position"], "aktivitet_id": aid,
                     "aktivitet": navn, "kategori": kategori,
                     "soner": {}, "distanse_km": None, "minutter": 0}

            # Sortert, fordi eksporten ikke gir målingene i fast rekkefølge.
            for m in sorted(a["ReportedActivityMetrics"], key=lambda m: m["ActivityMetricId"]):
                mid, v = m["ActivityMetricId"], m["Value"]
                rad = {"okt_id": s["Id"], "dato": s["Date"], "okt_navn": s["Name"],
                       "posisjon": a["Position"], "aktivitet_id": aid,
                       "aktivitet": navn, "kategori": kategori,
                       "metrikk_id": mid, "sone": "", "minutter": "", "distanse_km": ""}
                if mid in SONER:
                    z = SONER[mid]
                    blokk["soner"][z] = blokk["soner"].get(z, 0) + v
                    blokk["minutter"] += v
                    sone_min[z] += v
                    rad.update(sone=z, minutter=v)
                elif mid == METRIKK_DISTANSE:
                    blokk["distanse_km"] = v
                    km += v
                    rad.update(distanse_km=v)
                elif mid == METRIKK_OTEK:
                    blokk["minutter"] += v
                    otek_min += v
                    rad.update(minutter=v)
                elif mid == METRIKK_STYRKE:
                    blokk["minutter"] += v
                    styrke_min += v
                    rad.update(minutter=v)
                else:
                    advarsler[f"ukjent ActivityMetricId {mid}"] += 1
                rader.append(rad)
            blokker.append(blokk)

        sone_sum = sum(sone_min.values())
        # Varighet = sonetid + styrketid. O-teknikk overlapper med løpetid og telles ikke.
        if s["Duration"] is not None and abs(sone_sum + styrke_min - s["Duration"]) > 1:
            advarsler["varighet stemmer ikke med sone+styrke"] += 1

        hoyeste = max(sone_min, key=lambda z: int(z[1:]), default=None)
        sm = {m["SessionMetricId"]: m["Value"] for m in s["ReportedSessionMetrics"]}
        komm = sorted(s["Comments"], key=lambda c: c["CreatedAt"])
        # Isaks egne notater skilles fra kommentarer fra andre (trenere o.l.)
        egne = [c["Text"] for c in komm if meg is None or c["AuthorId"] == meg]
        andre = [c["Text"] for c in komm if meg is not None and c["AuthorId"] != meg]

        okter.append({
            "id": s["Id"],
            "dato": s["Date"],
            "rekkefolge": s["Order"],
            "navn": s["Name"],
            "beskrivelse": s["Description"],
            "kommentar": "\n\n".join(egne) or None,
            "kommentarer_andre": andre,
            "varighet_min": s["Duration"],
            "hoyeste_sone": hoyeste,                 # beregnet fra sonedata
            "hoyeste_sone_registrert": s["MaxIZone"],  # feltet fra eksporten (avviker i noen økter)
            "sone_min": dict(sorted(sone_min.items())),
            "distanse_km": round(km, 2),
            "loping_min": sum(b["minutter"] for b in blokker if b["aktivitet_id"] in LOPING),
            "otek_min": otek_min,
            "styrke_min": styrke_min,
            "opplevd_belastning": sm.get(1),  # SessionMetricId 1, skala 1–10
            "dagsform": sm.get(2),            # SessionMetricId 2, skala 1–10
            "blokker": blokker,
        })

    ut.mkdir(exist_ok=True)
    (ut / "okter.json").write_text(json.dumps(okter, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(ut / "blokker.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rader[0].keys()) if rader else [], delimiter=";")
        w.writeheader()
        w.writerows(rader)

    if bruker:
        dager = []
        for h in sorted(bruker["HealthStatuses"], key=lambda h: h["Date"]):
            if h["Date"] < fra:
                continue
            flagg = {navn: h[felt] for felt, navn in DAGFLAGG.items()}
            dag = {"dato": h["Date"], **flagg, "notat": h["Comment"] or None,
                   "sykdom": None, "skade": None}
            if h["ReportedSickness"]:
                r = h["ReportedSickness"]
                dag["sykdom"] = {"symptomer": r["Details"], "kommentar": r["Comment"],
                                 "pavirkning_deltagelse": r["ImpactOnParticipation"],
                                 "pavirkning_prestasjon": r["ImpactOnPerformance"]}
            if h["ReportedInjury"]:
                dag["skade"] = [{"type": x["Type"], "kroppsdel": x["BodyPart"], "kommentar": x["Comment"],
                                 "pavirkning_deltagelse": x["ImpactOnParticipation"],
                                 "pavirkning_prestasjon": x["ImpactOnPerformance"]}
                                for x in h["ReportedInjury"]["Details"]]
            # Hopp over tomme rapporter (alle flagg av, ingen tekst) – de betyr det samme som ingen rapport
            if any(flagg.values()) or dag["notat"] or dag["sykdom"] or dag["skade"]:
                dager.append(dag)
        (ut / "dager.json").write_text(json.dumps(dager, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(dager)} dagsrapporter")

        sz = bruker["IntensityZones"][0] if bruker["IntensityZones"] else None
        profil = {
            "navn": f'{bruker["GivenName"]} {bruker["Surname"]}',
            "idrett": bruker["Settings"]["Sport"]["Name"],
            "forbund": bruker["Settings"]["Federation"]["Name"],
            "klubb": bruker["Settings"]["Club"]["Name"],
            "pulssoner": ({z: sz[z] for z in ("I1", "I2", "I3", "I4", "I5")} | {"enhet": "slag/min",
                          "sist_oppdatert": sz["UpdatedAt"][:10]}) if sz else None,
        }
        (ut / "profil.json").write_text(json.dumps(profil, ensure_ascii=False, indent=1), encoding="utf-8")

    if uker_raw:
        uker = {}
        for x in sorted(uker_raw, key=lambda x: x["CreatedAt"]):
            ar, uke = FLYTTET_KOMMENTAR.get(x.get("Id")) or rett_uke(x["CommentedYear"], x["CommentedWeekNumber"])
            mandag = date.fromisocalendar(ar, uke, 1).isoformat()
            if date.fromisocalendar(ar, uke, 7).isoformat() < fra:  # uka slutter før startdato
                continue
            u = uker.setdefault((ar, uke), {"ar": ar, "uke": uke, "mandag": mandag, "kommentarer": []})
            tekst, start = x["Text"], FJERNET_START.get(x.get("Id"), "")
            if start and tekst.startswith(start):
                tekst = tekst[len(start):]
            u["kommentarer"].append({"tekst": tekst, "skrevet": x["CreatedAt"][:10],
                                     "egen": meg is None or x["AuthorId"] == meg})
        uker = [uker[k] for k in sorted(uker)]
        (ut / "uker.json").write_text(json.dumps(uker, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(uker)} uker med kommentar")

    print(f"{len(okter)} økter fra {fra} ({okter[0]['dato']} – {okter[-1]['dato']}), {len(rader)} målinger")
    for k, v in advarsler.items():
        print(f"ADVARSEL: {k}: {v}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("raw", nargs="?", default=str(ROOT / "data/raw"), help="mappe med rå eksport")
    p.add_argument("--fra", default="2019-11-01", help="første dato som tas med (ÅÅÅÅ-MM-DD)")
    a = p.parse_args()
    konverter(Path(a.raw), a.fra)
