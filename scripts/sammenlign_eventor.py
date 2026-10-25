"""
Sjekker hva norsk Eventor gir av resultater og strekktider, før vi bygger hent_eventor.py.

Skriptet bare leser. Det skriver ut antall og feltnavn, aldri navn på andre løpere. Svaret
lagres urørt i data/raw/eventor/results_person.xml (holdt utenfor git), slik at videre
utvikling ikke krever nye kall.

Krever data/raw/eventor.json: {"api_nokkel": "…", "person_id": 12345}. Nøkkelen er en
klubbnøkkel og skal aldri publiseres. Person-id-en står i adressefeltet på profilen eller
på en resultatside i Eventor.

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/sammenlign_eventor.py            # henter og analyserer
    .venv\\Scripts\\python scripts/sammenlign_eventor.py --lagret   # analyserer lagret svar
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OPPSETT = ROOT / "data/raw/eventor.json"
RA = ROOT / "data/raw/eventor"
RESULTATER = RA / "results_person.xml"
DAGER = ROOT / "data/dager.json"
API = "https://eventor.orientering.no/api"
FRA = "2019-11-01"
# Ingen top: med top=N dropper Eventor løp der personen ikke selv var blant de beste, og
# stafetter uten plassering (186 resultater uten top mot 109 med top=5). Se wiki-siden
# problem-eventor-top. Vinnertid og referansestrekk hentes per løp i hent_eventor.py.
TOPP: int | None = None


class Feil(Exception):
    pass


# ── Oppsett og henting ──────────────────────────────────

def les_oppsett(fil: Path = OPPSETT) -> tuple[str, str]:
    """Gir (api-nøkkel, person-id). Feiler med en tydelig melding hvis noe mangler."""
    if not fil.exists():
        raise Feil(f"{fil.relative_to(ROOT) if fil.is_relative_to(ROOT) else fil} finnes ikke. "
                   'Lag den med {"api_nokkel": "…", "person_id": …}.')
    try:
        oppsett = json.loads(fil.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        raise Feil(f"data/raw/eventor.json er ikke gyldig JSON ({e}).") from e
    nokkel = str(oppsett.get("api_nokkel") or "").strip()
    if not nokkel:
        raise Feil("API-nøkkelen mangler. Lim klubbnøkkelen inn som «api_nokkel» i data/raw/eventor.json.")
    person_id = str(oppsett.get("person_id") or "").strip()
    if not person_id.isdigit():
        raise Feil("Person-id-en mangler. Legg den inn som «person_id» (et tall) i data/raw/eventor.json. "
                   "Den står i adressefeltet på profilen din i Eventor.")
    return nokkel, person_id


def hent(sti: str, nokkel: str, **params) -> bytes:
    url = f"{API}{sti}" + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"ApiKey": nokkel, "Accept": "application/xml",
                                               "User-Agent": "treningsdagbok"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise Feil(f"Eventor avviste nøkkelen ({e.code}). Sjekk «api_nokkel» i data/raw/eventor.json, "
                       "og at klubbnøkkelen har tilgang til resultater.") from e
        if e.code == 404:
            raise Feil(f"Eventor fant ikke {sti} (404). Sjekk «person_id» i data/raw/eventor.json.") from e
        raise Feil(f"Eventor svarte {e.code} på {sti}.") from e
    except urllib.error.URLError as e:
        raise Feil(f"Fikk ikke kontakt med Eventor ({e.reason}).") from e


def hent_resultater(nokkel: str, person_id: str, til: str | None = None) -> bytes:
    """Henter og lagrer svaret urørt i data/raw/eventor/results_person.xml."""
    ekstra = {"top": TOPP} if TOPP else {}
    data = hent("/results/person", nokkel, personId=person_id, fromDate=FRA,
                toDate=til or date.today().isoformat(), includeSplitTimes="true", **ekstra)
    RA.mkdir(parents=True, exist_ok=True)
    RESULTATER.write_bytes(data)
    return data


# ── Analyse (rene funksjoner) ───────────────────────────

def lokalt(tag) -> str:
    """Elementnavnet uten navnerom."""
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def barn(e: ET.Element, navn: str) -> list[ET.Element]:
    return [b for b in e if lokalt(b.tag) == navn]


def forste(e: ET.Element | None, *sti: str) -> ET.Element | None:
    """Første element langs stien av lokale navn, eller None."""
    for navn in sti:
        if e is None:
            return None
        e = next((b for b in e if lokalt(b.tag) == navn), None)
    return e


def tekst(e: ET.Element | None) -> str | None:
    return e.text.strip() if e is not None and e.text and e.text.strip() else None


def er_person(e: ET.Element, person_id: str) -> bool:
    """Om resultatelementet gjelder personen: Person/PersonId eller PersonId rett under."""
    # Et element uten barn er usant i en if, så None må sjekkes eksplisitt.
    pid = forste(e, "Person", "PersonId")
    if pid is None:
        pid = forste(e, "PersonId")
    return tekst(pid) == person_id


def lop_dato(lop: ET.Element) -> str | None:
    """Datoen fra Event/StartDate/Date, eller første Date under løpet."""
    d = tekst(forste(lop, "StartDate", "Date")) or tekst(forste(lop, "StartDate"))
    if not d:
        d = next((tekst(x) for x in lop.iter() if lokalt(x.tag) == "Date" and tekst(x)), None)
    return d[:10] if d else None


def elementstier(e: ET.Element, prefiks: str = "") -> set[str]:
    """Stiene til alle elementene under e, med attributtnavn i hakeparentes. Ingen verdier."""
    stier = set()
    for b in e:
        sti = f"{prefiks}/{lokalt(b.tag)}" if prefiks else lokalt(b.tag)
        stier.add(sti + (f" [{', '.join(sorted(b.attrib))}]" if b.attrib else ""))
        stier |= elementstier(b, sti)
    return stier


def analyser(xml: bytes, person_id: str) -> dict:
    """Teller løp, strekktider, klassifisering og klasser for personens egne resultater.
    Gir bare antall, klassenavn og elementnavn, aldri navn eller id på andre."""
    rot = ET.fromstring(xml)
    lister = [rot] if lokalt(rot.tag) == "ResultList" else [e for e in rot.iter() if lokalt(e.tag) == "ResultList"]
    egne = []  # (dato, event_id, klasse, stafett, resultatelement, løpselement)
    for rl in lister:
        lop = forste(rl, "Event")
        dato = lop_dato(lop) if lop is not None else None
        eid = tekst(forste(lop, "EventId"))
        for kr in barn(rl, "ClassResult"):
            klasse = tekst(forste(kr, "EventClass", "Name")) or tekst(forste(kr, "EventClass", "ClassShortName"))
            for res in kr:
                navn = lokalt(res.tag)
                if navn == "PersonResult" and er_person(res, person_id):
                    egne.append((dato, eid, klasse, False, res, lop))
                elif navn == "TeamResult":
                    egne += [(dato, eid, klasse, True, m, lop) for m in res
                             if lokalt(m.tag) in ("TeamMemberResult", "PersonResult") and er_person(m, person_id)]

    # Et flerdagersløp har ett RaceResult per etappe, med egen dato under EventRace.
    per_ar = Counter()
    datoer = set()
    lop_sett = set()
    for dato, eid, _, _, res, lop in egne:
        etapper = {tekst(forste(r, "EventRaceId")): tekst(forste(r, "RaceDate", "Date"))
                   for r in (barn(lop, "EventRace") if lop is not None else [])}
        lop_her = [(tekst(forste(rr, "EventRaceId")), None) for rr in barn(res, "RaceResult")] or [(None, dato)]
        for race_id, d in lop_her:
            d = (etapper.get(race_id) or dato) if race_id else d
            if (eid, race_id, d) not in lop_sett:
                lop_sett.add((eid, race_id, d))
                per_ar[(d or "????")[:4]] += 1
            if d:
                datoer.add(d[:10])

    def har_strekk(res: ET.Element) -> bool:
        return any(lokalt(x.tag) == "SplitTime" for x in res.iter())

    klassifisering = Counter()
    for *_, lop in egne:
        if lop is None:
            continue
        for felt in ("EventClassificationId", "EventStatusId", "DisciplineId", "EventForm"):
            v = tekst(forste(lop, felt))
            if v:
                klassifisering[f"{felt}={v}"] += 1
        for k, v in lop.attrib.items():
            klassifisering[f"Event@{k}={v}"] += 1
        for race in barn(lop, "EventRace"):
            for k, v in race.attrib.items():
                klassifisering[f"EventRace@{k}={v}"] += 1

    stier = set()
    for _, _, _, _, res, _ in egne:
        stier |= elementstier(res)
    status = Counter()
    for _, _, _, _, res, _ in egne:
        cs = next((x for x in res.iter() if lokalt(x.tag) == "CompetitorStatus"), None)
        if cs is not None:
            status[cs.get("value") or tekst(cs) or "?"] += 1

    return {
        "resultater": len(egne),
        "lop": len(lop_sett),
        "lop_per_ar": dict(sorted(per_ar.items())),
        "datoer": datoer,
        "med_strekk": sum(har_strekk(r) for _, _, _, _, r, _ in egne),
        "stafett": sum(1 for e in egne if e[3]),
        "individuelle": sum(1 for e in egne if not e[3]),
        "klassifisering": klassifisering,
        "klasser": Counter(e[2] or "?" for e in egne),
        "status": status,
        "elementer": sorted(stier),
        "resultatlister": len(lister),
    }


def konkurransedager(fil: Path = DAGER) -> set[str]:
    return {d["dato"] for d in json.loads(fil.read_text(encoding="utf-8")) if d.get("konkurranse")}


# ── Utskrift ────────────────────────────────────────────

def skriv_ut(a: dict, dager: set[str]) -> None:
    print(f"{a['resultatlister']} resultatlister, {a['resultater']} egne resultater "
          f"({a['individuelle']} individuelle, {a['stafett']} stafett/lag)")
    print(f"{a['lop']} løpsdager (etappene i flerdagersløp telt hver for seg)")
    print(f"Med strekktider: {a['med_strekk']} av {a['resultater']}")
    print("\nLøp per år (Eventor) mot konkurransedager i dager.json:")
    dager_ar = Counter(d[:4] for d in dager)
    for ar in sorted(set(a["lop_per_ar"]) | set(dager_ar)):
        print(f"  {ar}: Eventor {a['lop_per_ar'].get(ar, 0):3}, dagboka {dager_ar.get(ar, 0):3}")
    felles = a["datoer"] & dager
    print(f"Datoer: {len(felles)} felles, {len(a['datoer'] - dager)} bare i Eventor, "
          f"{len(dager - a['datoer'])} bare i dagboka")
    print("\nStatus:", dict(a["status"].most_common()))
    print("\nKlassifisering og løpsform:")
    for k, n in sorted(a["klassifisering"].items()):
        print(f"  {k}: {n}")
    print("\nKlasser:", ", ".join(f"{k} {n}" for k, n in a["klasser"].most_common()))
    print("\nElementer under hans resultat:")
    for s in a["elementer"]:
        print(f"  {s}")


def main(argv: list[str]) -> int:
    for strom in (sys.stdout, sys.stderr):
        strom.reconfigure(encoding="utf-8")
    try:
        nokkel, person_id = les_oppsett()
        if "--lagret" in argv:
            if not RESULTATER.exists():
                raise Feil("Fant ikke data/raw/eventor/results_person.xml. Kjør uten --lagret først.")
            xml = RESULTATER.read_bytes()
        else:
            xml = hent_resultater(nokkel, person_id)
            print(f"Lagret svaret ({len(xml)} byte) i {RESULTATER.relative_to(ROOT).as_posix()}\n")
        try:
            analyse = analyser(xml, person_id)
        except ET.ParseError as e:
            raise Feil(f"Svaret er ikke gyldig XML ({e}). Se data/raw/eventor/results_person.xml.") from e
    except Feil as e:
        print(f"Avbrutt: {e}", file=sys.stderr)
        return 1
    skriv_ut(analyse, konkurransedager())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
