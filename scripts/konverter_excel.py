"""
Konverterer Excel-dagboka for 2016–2019 til samme form som eksporten fra OLT.

Leser fra data/raw/excel/:
    *.xlsx  – én arbeidsbok per sesong (1. nov.–31. okt.), arket «Dag»

og scripts/excel_tekst.json, som er skrevet for hånd: et navn per økt, og hvor dagens
felles kommentar skal deles når dagen har flere økter.

Bruk (fra prosjektmappen):
    .venv/Scripts/python scripts/konverter_excel.py
    .venv/Scripts/python scripts/konverter_excel.py --gjennomsyn   # liste til .impeccable/review/

Lager i data/raw/excel/:
    workoutSessions.json  – øktene, i samme form som OLT-eksporten
    healthStatuses.json   – dagsrapportene (skadet, syk, fridag, konkurranse, notat)

`konverter.py` leser de to filene sammen med OLT-eksporten, så Excel-øktene går gjennom
samme kode som resten. Krever openpyxl. Se «Excel-dagboka» i CLAUDE.md.
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, time, timedelta
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
EXCEL = ROOT / "data/raw/excel"
TEKST = ROOT / "scripts/excel_tekst.json"
GJENNOMSYN = ROOT / ".impeccable/review/excel-gjennomsyn.md"

# Typene i Excel-dagboka -> (ActivityId, ActivityId for o-teknikk eller None, navn til økter uten navn).
# Forkortelsene er ulike i de tre filene. Hver fil sjekkes mot sitt eget ark «Inställningar».
TYPER = {
    "OL": (1, 9, "O-løp"),
    "SOL": (2, 11, "Sprint-o"),
    "SkO": (5, 11, "Ski-o"),
    "Lø": (2, None, "Løp"),
    "LøV": (2, None, "Løp"),
    "SkS": (5, None, "Skate"),
    "SkK": (4, None, "Klassisk"),
    "Rs": (6, None, "Rulleski"),
    "RsS": (6, None, "Rulleski skate"),
    "RsK": (6, None, "Rulleski klassisk"),
    "Sy": (7, None, "Sykkel"),
    "Al": (8, None, "Alternativ"),
    "St": (12, None, "Styrke"),
}
LOPING = {1, 2, 3}
SKI = {4, 5, 6}
STYRKE = 12
OTEK_SPRINT = 11
# Løperader kan rettes for hånd i excel_tekst.json («lop»), siden Excel ikke skiller underlaget.
LOP = {"terreng": 1, "vei": 2, "molle": 3}

# Excel har tre intensiteter. Isak har valgt sonene de føres i (2026-11-16).
SONE_METRIKK = {"lag": 1, "mod": 2, "hog": 4}
METRIKK_DISTANSE, METRIKK_OTEK, METRIKK_STYRKE = 9, 11, 12
RADER_PER_DAG = 4


class Feil(Exception):
    """Arbeidsboka eller tekstfila har noe konverteringen ikke kan tolke."""


def norm(v) -> str:
    """Overskrift uten linjeskift, bindestrek og mellomrom: «trän-typ» over to linjer -> «träntyp»."""
    return re.sub(r"[\s-]", "", str(v)).lower() if v is not None else ""


def sekunder(v) -> int:
    """Tid i en celle som sekunder. Excel gir varighet, klokkeslett eller brøkdel av et døgn."""
    if v is None or v == "":
        return 0
    if isinstance(v, timedelta):
        return round(v.total_seconds())
    if isinstance(v, datetime):  # varighet over 24 timer leses som en dato i år 1900
        return round((v - datetime(1899, 12, 30)).total_seconds())
    if isinstance(v, time):
        return v.hour * 3600 + v.minute * 60 + v.second
    if isinstance(v, int | float):
        return round(v * 86400)
    raise Feil(f"ukjent tid: {v!r}")


def tall(v):
    """Tall i en celle, eller None. Heltall blir int, så JSON-en får 6 og ikke 6.0."""
    if v is None or v == "":
        return None
    if isinstance(v, bool) or not isinstance(v, int | float):
        raise Feil(f"ventet tall, fikk {v!r}")
    return int(v) if float(v).is_integer() else round(float(v), 2)


def kolonner(rad3, rad4) -> dict[str, int]:
    """Kolonnene i arket «Dag», funnet fra overskriftene. 2018–19 mangler Borg og er forskjøvet."""
    navn = {}
    for i, v in enumerate(rad3):
        n = norm(v)
        if n == "pass":  # her begynner arbeidsbokas egen tabell med summer per dag
            break
        if n:
            navn.setdefault(n, i)
    try:
        kol = {
            "datum": navn["datum"], "type": navn["träntyp"], "ny_okt": navn["antpa"],
            "lag": navn["intensitet"], "mod": navn["intensitet"] + 1, "hog": navn["intensitet"] + 2,
            "km": navn["km"], "fo": navn["fo"],
            "puls_maks": navn["puls"], "puls_snitt": navn["puls"] + 1,
            "kontroller": navn["kontroller"], "spikret": navn["kontroller"] + 1,
            "flyt": navn["flyt"], "tavl": navn["tävl"], "strekk": navn["sträckplaceringar"],
            "kommentar": navn["vilopuls"],
            "skadad": navn["skadad"], "sjuk": navn["sjuk"], "vilodag": navn["vilodag"],
        }
    except KeyError as e:
        raise Feil(f"mangler kolonnen {e} i arket Dag") from e
    ventet = {"lag": "låg", "mod": "mod", "hog": "hög", "puls_maks": "max", "puls_snitt": "med",
              "kontroller": "tot", "spikret": "spik", "kommentar": "beskrivningavdagensträning"}
    for felt, tekst in ventet.items():
        if norm(rad4[kol[felt]]) != tekst:
            raise Feil(f"ventet «{tekst}» i rad 4, kolonne {kol[felt] + 1}, fikk {rad4[kol[felt]]!r}")
    return kol


def kontrolltabell(rad3, rad4, datarader) -> dict[str, dict[str, tuple]]:
    """Arbeidsbokas egne summer per dag: {dato: {type: (økter, sekunder, km)}}. Bare til kontroll."""
    start = next((i for i, v in enumerate(rad3) if norm(v) == "pass"), None)
    if start is None:
        return {}
    dato_kol = next(i for i in range(start, len(rad4)) if norm(rad4[i]) == "datum")
    typer = []
    for v in rad4[dato_kol + 1:]:
        if v is None or v in typer:
            break
        typer.append(v)
    n, ut = len(typer), {}
    for rad in datarader:
        d = rad[dato_kol] if len(rad) > dato_kol else None
        if not isinstance(d, datetime):
            continue
        celler = list(rad[dato_kol + 1: dato_kol + 1 + 3 * n]) + [None] * (3 * n)
        ut[d.date().isoformat()] = {
            t: (celler[i] or 0, sekunder(celler[n + i]), celler[2 * n + i] or 0) for i, t in enumerate(typer)}
    return ut


def les_arbeidsbok(sti: Path) -> tuple[list[dict], dict]:
    """Leser arket «Dag»: én post per dag med radene, kommentaren og flaggene, og kontrolltabellen."""
    wb = openpyxl.load_workbook(sti, data_only=True, read_only=True)
    try:
        rader = [tuple(r) for r in wb["Dag"].iter_rows(values_only=True)]
        innst = [tuple(r) for r in wb["Inställningar"].iter_rows(values_only=True)]
    finally:
        wb.close()

    tittel = next((str(v) for v in rader[0] if v), "")
    m = re.search(r"(\d\d)\.(\d\d)\.(\d{4}) - (\d\d)\.(\d\d)\.(\d{4})", tittel)
    if not m:
        raise Feil(f"{sti.name}: finner ikke perioden i tittelen {tittel!r}")
    d1, m1, a1, d2, m2, a2 = map(int, m.groups())
    start, slutt = date(a1, m1, d1), date(a2, m2, d2)

    kol = kolonner(rader[2], rader[3])
    # Typene står som nummer, forkortelse og beskrivelse i «Inställningar».
    gyldige = {r[2] for r in innst if len(r) > 3 and isinstance(r[1], int | float) and isinstance(r[2], str)}
    ukjente = gyldige - set(TYPER)
    if ukjente:
        raise Feil(f"{sti.name}: ukjente treningstyper i Inställningar: {sorted(ukjente)}")

    def celle(rad, felt, forskyvning=0):
        i = kol[felt] + forskyvning
        return rad[i] if i < len(rad) else None

    dager = []
    antall = (slutt - start).days + 1
    for n in range(antall):
        dato = start + timedelta(days=n)
        blokk = rader[4 + n * RADER_PER_DAG: 4 + (n + 1) * RADER_PER_DAG]
        if not blokk:
            raise Feil(f"{sti.name}: arket slutter før {dato}")
        blokk += [()] * (RADER_PER_DAG - len(blokk))  # arket slutter med tomme rader
        # Datoen står som ukedag, dag og måned over tre linjer. Dagen sjekkes mot den utregnede datoen.
        etikett = re.search(r"\d+", str(celle(blokk[0], "datum") or ""))
        if not etikett or int(etikett.group()) != dato.day:
            raise Feil(f"{sti.name}: ventet {dato} i rad {5 + n * RADER_PER_DAG}, fikk {celle(blokk[0], 'datum')!r}")

        okt_rader = []
        for i, rad in enumerate(blokk):
            har_data = any(celle(rad, f) not in (None, "") for f in ("ny_okt", "lag", "mod", "hog", "km"))
            typ = celle(rad, "type")
            if typ in (None, ""):
                if har_data:
                    raise Feil(f"{sti.name} {dato}: rad {i + 1} har tall, men ingen treningstype")
                continue
            if typ not in gyldige:
                raise Feil(f"{sti.name} {dato}: ukjent treningstype {typ!r}")
            okt_rader.append({
                "type": typ,
                "ny_okt": bool(tall(celle(rad, "ny_okt"))),
                "lag": sekunder(celle(rad, "lag")), "mod": sekunder(celle(rad, "mod")),
                "hog": sekunder(celle(rad, "hog")),
                "km": tall(celle(rad, "km")), "fo": tall(celle(rad, "fo")),
                "puls_maks": tall(celle(rad, "puls_maks")), "puls_snitt": tall(celle(rad, "puls_snitt")),
                "kontroller": tall(celle(rad, "kontroller")), "spikret": tall(celle(rad, "spikret")),
                "flyt": tall(celle(rad, "flyt")), "tavl": bool(tall(celle(rad, "tavl"))),
                "strekk": [tall(celle(rad, "strekk", j)) for j in range(4)],
            })
        # Kommentaren står i dagens andre rad. Første rad har bare etikettene «vilopuls» og «sömn».
        kommentar = celle(blokk[1], "kommentar")
        dager.append({
            "dato": dato.isoformat(),
            "rader": okt_rader,
            "kommentar": (str(kommentar).strip() or None) if kommentar is not None else None,
            "skadad": any(tall(celle(r, "skadad")) for r in blokk),
            "sjuk": any(tall(celle(r, "sjuk")) for r in blokk),
            "vilodag": any(tall(celle(r, "vilodag")) for r in blokk),
        })
    return dager, kontrolltabell(rader[2], rader[3], rader[4:])


def del_kommentar(tekst: str | None, deler: list | None, antall_okter: int, dato: str) -> tuple[dict, str | None]:
    """Fordeler dagens kommentar: ({øktnummer: tekst}, dagsnotat).

    `deler` er en liste med [mål, anker]. Målet er øktas nummer (1, 2 …), "dag" for
    dagsnotatet eller "alle" når delen handler om alle øktene og ikke kan deles. Ankeret
    er ordene delen begynner med. Første del har tomt anker og
    begynner i starten av teksten. Delene dekker hele teksten, og bare mellomrommet i
    kuttene fjernes, så ingenting kan bli borte eller endret.
    """
    if not tekst:
        if deler:
            raise Feil(f"{dato}: «deler» er satt, men dagen har ingen kommentar")
        return {}, None
    if not deler:
        deler = [[1, ""]] if antall_okter else [["dag", ""]]
    if deler[0][1] != "":
        raise Feil(f"{dato}: første del må ha tomt anker")
    kutt = [0]
    for _, anker in deler[1:]:
        if not anker:
            raise Feil(f"{dato}: bare første del kan ha tomt anker")
        pos = tekst.find(anker, kutt[-1] + 1)
        if pos < 0:
            raise Feil(f"{dato}: finner ikke «{anker}» i kommentaren etter forrige kutt")
        if tekst.find(anker, pos + 1) >= 0:
            raise Feil(f"{dato}: «{anker}» står flere steder i kommentaren, bruk et lengre anker")
        kutt.append(pos)
    kutt.append(len(tekst))

    per_okt, dag = {}, []
    for (mal, _), a, b in zip(deler, kutt, kutt[1:]):
        bit = tekst[a:b].strip()
        if mal == "dag":
            dag.append(bit)
        elif mal == "alle" and antall_okter:
            for n in range(1, antall_okter + 1):
                per_okt.setdefault(n, []).append(bit)
        elif isinstance(mal, int) and 1 <= mal <= antall_okter:
            per_okt.setdefault(mal, []).append(bit)
        else:
            raise Feil(f"{dato}: ukjent mål {mal!r} (dagen har {antall_okter} økter)")
    return {n: " ".join(b) for n, b in sorted(per_okt.items())}, " ".join(dag) or None


def del_i_okter(dag: dict) -> list[list[dict]]:
    """En rad med 1 i «ant pa» starter en ny økt. Rader uten hører til økta over."""
    okter = []
    for rad in dag["rader"]:
        if rad["ny_okt"]:
            okter.append([rad])
        elif not okter:
            raise Feil(f"{dag['dato']}: første rad mangler 1 i «ant pa»")
        else:
            okter[-1].append(rad)
    return okter


def typenavn(rader: list[dict]) -> str:
    """Navn til en økt uten navn i tekstfila: typene i rekkefølge, «O-løp + Løp»."""
    navn = []
    for r in rader:
        n = TYPER[r["type"]][2]
        if n not in navn:
            navn.append(n)
    return " + ".join(navn)


def minutter(sek: int, advarsler: Counter) -> int:
    if sek % 60:
        advarsler["tid som ikke er hele minutter (avrundet)"] += 1
    return round(sek / 60)


def bygg_okt(dato: str, nr: int, rader: list[dict], info: dict, advarsler: Counter) -> dict:
    """Én økt i OLT-form. `info` er øktas oppføring fra tekstfila: {navn, lop}."""
    lop = info.get("lop")
    if lop is not None and lop not in LOP:
        raise Feil(f"{dato}: ukjent «lop» {lop!r}")

    # Km ført på styrkeraden hører til løpingen i samme økt, når den står uten km.
    km = [r["km"] for r in rader]
    for i, r in enumerate(rader):
        if TYPER[r["type"]][0] == STYRKE and km[i]:
            mottaker = next((j for j, x in enumerate(rader)
                             if TYPER[x["type"]][0] in LOPING and not km[j]), None)
            if mottaker is not None:
                km[mottaker], km[i] = km[i], None
                advarsler["km på styrkerad flyttet til løperaden"] += 1

    blokker, ekstra_rader, varighet = [], [], 0
    for i, r in enumerate(rader):
        aid, otek, _ = TYPER[r["type"]]
        if lop and r["type"] in ("Lø", "LøV"):
            aid = LOP[lop]
        # Ski-o er ført som ski med kontroller fra 2017, og som egen type før det.
        if otek is None and aid in SKI and r["kontroller"]:
            otek = OTEK_SPRINT
        min_sone = {f: minutter(r[f], advarsler) for f in SONE_METRIKK}
        total = sum(min_sone.values())
        varighet += total

        if aid == STYRKE:
            malinger = [{"ActivityMetricId": METRIKK_STYRKE, "Value": total}]
        else:
            malinger = [{"ActivityMetricId": SONE_METRIKK[f], "Value": m} for f, m in min_sone.items() if m]
            if aid in LOPING and km[i]:
                malinger.append({"ActivityMetricId": METRIKK_DISTANSE, "Value": km[i]})
        blokker.append({"ActivityId": aid, "Position": len(blokker), "ReportedActivityMetrics": malinger})
        if otek:
            blokker.append({"ActivityId": otek, "Position": len(blokker),
                            "ReportedActivityMetrics": [{"ActivityMetricId": METRIKK_OTEK, "Value": total}]})

        # Det Excel har og OLT ikke: tas med urørt, så ingenting går tapt.
        ekstra = {"type": r["type"]}
        if km[i] and aid not in LOPING:
            ekstra["km"] = km[i]
        for felt in ("puls_maks", "puls_snitt", "kontroller", "spikret", "flyt"):
            if r[felt] is not None:
                ekstra[felt] = r[felt]
        if any(v is not None for v in r["strekk"]):
            ekstra["strekkplasseringer"] = [v or 0 for v in r["strekk"]]
        if r["tavl"]:
            ekstra["konkurranse"] = True
        ekstra_rader.append(ekstra)

    form = next((r["fo"] for r in rader if r["fo"] is not None), None)
    return {
        "Id": f"excel-{dato}-{nr}",
        "Date": dato, "Order": nr - 1,
        "Name": info.get("navn") or typenavn(rader),
        "Description": None,
        "Duration": varighet, "MaxIZone": None,
        "Comments": [],
        "ReportedSessionMetrics": [{"SessionMetricId": 2, "Value": form}] if form is not None else [],
        "ReportedUserDefinedMetrics": [],
        "ReportedSessionActivities": blokker,
        "Ekstra": {"kilde": "excel", "navn_fra": "forslag" if info.get("navn") else "type", "rader": ekstra_rader},
    }


def bygg(dager: list[dict], tekst: dict) -> tuple[list[dict], list[dict], Counter]:
    """Dagene fra arbeidsbøkene -> (økter, dagsrapporter, advarsler), begge i OLT-form."""
    okter, helse, advarsler = [], [], Counter()
    ubrukt = set(tekst) - {d["dato"] for d in dager}
    if ubrukt:
        raise Feil(f"tekstfila har datoer som ikke finnes i arbeidsbøkene: {sorted(ubrukt)[:5]}")

    for dag in dager:
        dato, info = dag["dato"], tekst.get(dag["dato"], {})
        grupper = del_i_okter(dag)
        okt_info = info.get("okter", [])
        if len(okt_info) > len(grupper):
            raise Feil(f"{dato}: tekstfila har {len(okt_info)} økter, dagen har {len(grupper)}")
        if len(grupper) > 1 and dag["kommentar"] and not info.get("deler"):
            advarsler["flerøktsdag uten delt kommentar (hele teksten på første økt)"] += 1
        per_okt, notat = del_kommentar(dag["kommentar"], info.get("deler"), len(grupper), dato)

        for nr, rader in enumerate(grupper, 1):
            okt = bygg_okt(dato, nr, rader, okt_info[nr - 1] if nr <= len(okt_info) else {}, advarsler)
            if nr in per_okt:
                okt["Comments"] = [{"Text": per_okt[nr], "AuthorId": None, "CreatedAt": f"{dato}T00:00:00"}]
            if okt["Ekstra"]["navn_fra"] == "type":
                advarsler["økt uten navn i tekstfila (navn fra typene)"] += 1
            okter.append(okt)

        if dag["vilodag"] and grupper:
            advarsler[f"vilodag på en dag med økt: {dato}"] += 1
        rapport = {
            "Date": dato, "Comment": notat, "ReportedSickness": None, "ReportedInjury": None,
            "IsSick": dag["sjuk"], "IsInjured": dag["skadad"], "IsTraveling": False, "IsAltitudeDay": False,
            "IsDayOff": dag["vilodag"], "IsCompetitionDay": any(r["tavl"] for r in dag["rader"]),
        }
        if notat or any(v is True for v in rapport.values()):
            helse.append(rapport)
    return okter, helse, advarsler


def kontroller(dager: list[dict], kontroll: dict) -> list[str]:
    """Sammenligner radene med arbeidsbokas egne summer per dag og type. Tom liste = alt stemmer."""
    avvik = []
    for dag in dager:
        fasit = kontroll.get(dag["dato"])
        if fasit is None:
            avvik.append(f"{dag['dato']}: mangler i arbeidsbokas tabell")
            continue
        mine = {t: [0, 0, 0.0] for t in fasit}
        for r in dag["rader"]:
            m = mine.setdefault(r["type"], [0, 0, 0.0])
            m[0] += r["ny_okt"]
            m[1] += r["lag"] + r["mod"] + r["hog"]
            m[2] += r["km"] or 0
        for t, (okter, sek, km) in mine.items():
            f_okter, f_sek, f_km = fasit.get(t, (0, 0, 0))
            if okter != f_okter or abs(sek - f_sek) > 1 or abs(km - f_km) > 0.01:
                avvik.append(f"{dag['dato']} {t}: leste {okter} økter, {sek} s, {km} km, "
                             f"arbeidsboka sier {f_okter}, {f_sek}, {f_km}")
    return avvik


def gjennomsyn(okter: list[dict], helse: list[dict]) -> str:
    """Liste Isak kan lese over før noe committes: navn, innhold og tekst per økt."""
    notat = {h["Date"]: h["Comment"] for h in helse if h["Comment"]}
    per_dato = {}
    for o in okter:
        per_dato.setdefault(o["Date"], []).append(o)
    linjer = ["# Excel-dagboka: navn og kommentarer per økt", ""]
    for dato in sorted(set(per_dato) | set(notat)):
        linjer.append(f"## {dato}")
        for o in per_dato.get(dato, []):
            typer = "+".join(r["type"] for r in o["Ekstra"]["rader"])
            merke = "" if o["Ekstra"]["navn_fra"] == "forslag" else " (navn fra typene)"
            linjer.append(f"- **{o['Name']}**{merke} · {typer} · {o['Duration']} min")
            for c in o["Comments"]:
                linjer.append(f"  > {c['Text']}")
        if dato in notat:
            linjer.append(f"- *Dagsnotat:* {notat[dato]}")
        linjer.append("")
    return "\n".join(linjer)


def konverter_excel(mappe: Path = EXCEL, tekstfil: Path = TEKST, skriv_gjennomsyn: bool = False) -> bool:
    filer = sorted(mappe.glob("*.xlsx"))
    if not filer:
        raise Feil(f"ingen .xlsx i {mappe}")
    dager, avvik = [], []
    for sti in filer:
        d, kontroll = les_arbeidsbok(sti)
        avvik += kontroller(d, kontroll)
        dager += d
    dager.sort(key=lambda d: d["dato"])
    datoer = [d["dato"] for d in dager]
    if len(set(datoer)) != len(datoer):
        raise Feil("arbeidsbøkene overlapper i tid")

    tekst = json.loads(tekstfil.read_text(encoding="utf-8")) if tekstfil.exists() else {}
    okter, helse, advarsler = bygg(dager, tekst)

    (mappe / "workoutSessions.json").write_text(json.dumps(okter, ensure_ascii=False, indent=1), encoding="utf-8")
    (mappe / "healthStatuses.json").write_text(json.dumps(helse, ensure_ascii=False, indent=1), encoding="utf-8")
    if skriv_gjennomsyn:
        GJENNOMSYN.parent.mkdir(parents=True, exist_ok=True)
        GJENNOMSYN.write_text(gjennomsyn(okter, helse), encoding="utf-8")
        print(f"Gjennomsyn: {GJENNOMSYN}")

    print(f"{len(okter)} økter og {len(helse)} dagsrapporter fra {len(filer)} arbeidsbøker "
          f"({datoer[0]} – {datoer[-1]})")
    for k, v in sorted(advarsler.items()):
        print(f"ADVARSEL: {k}: {v}")
    for a in avvik[:20]:
        print(f"AVVIK: {a}")
    if avvik:
        print(f"{len(avvik)} avvik mot arbeidsbøkenes egne summer")
    else:
        print("Alle dager stemmer med arbeidsbøkenes egne summer (økter, tid og km per type)")
    return not avvik


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--gjennomsyn", action="store_true", help="skriv liste med navn og tekst per økt")
    a = p.parse_args()
    try:
        ok = konverter_excel(skriv_gjennomsyn=a.gjennomsyn)
    except Feil as e:
        sys.exit(f"FEIL: {e}")
    sys.exit(0 if ok else 1)
